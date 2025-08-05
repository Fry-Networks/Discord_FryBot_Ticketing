import { NextResponse } from 'next/server'
import { serviceSupabase } from '@/utils/supabase/serviceRole'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'
import { subDays, startOfDay, addDays, format } from 'date-fns'

const staffMap = process.env.STAFF_MAP ? JSON.parse(process.env.STAFF_MAP) : {}

type TicketClaim = {
  claimed_by: string
  claimed_by_username?: string
}

type TicketClose = {
  closed_by?: string // For ticketsbot and tickettool
  closed_by_id?: string // For tickets table
  closed_by_username?: string
}

// Centralized authorization check
const authorize = async (supabase: SupabaseClient<Database>) => {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError || !user) {
    await logger.warn('Unauthorized: No authenticated user found.', 'analytics-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  const userId = user.id
  const isStaff = await checkStaffRoleServerSide(userId)
  if (!isStaff) {
    await logger.warn(`Unauthorized: User ${userId} is not staff.`, 'analytics-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  return { user: user, error: null, status: 200 }
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { error, status } = await authorize(supabase)
  if (error) {
    return NextResponse.json({ error }, { status })
  }

  /*if (process.env.NODE_ENV === 'development') {
    return NextResponse.json({
      days: 30,
      ticketsCreated: 100,
      ticketsClosed: 80,
      staffActions: 200,
      logsByLevel: { 'info': 100, 'warn': 20, 'error': 5 },
      totalTicketsCreated: 1000,
      totalTicketsClosed: 800,
      openTickets: 200,
      claimedBreakdown: { 'testuser': 10 },
      claimedBySource: { live: { 'testuser': 5 }, ticketsbot: { 'testuser': 3 }, tickettool: { 'testuser': 2 } },
      claimedAvatars: { 'testuser': 'https://cdn.discordapp.com/embed/avatars/0.png' },
      closedBreakdown: { 'testuser': 8 },
      closedAvatars: { 'testuser': 'https://cdn.discordapp.com/embed/avatars/0.png' },
      ticketsCreatedHistory: [1, 2, 3],
      ticketsClosedHistory: [1, 2, 3],
      staffActionsHistory: [1, 2, 3],
      logsByLevelHistory: { 'info': [1, 2, 3] },
      ticketTypeBreakdown: { 'General Support': 10, 'Bug Report': 5 },
      totalClosedBySource: { live: 400, ticketsbot: 250, tickettool: 150 }
    });
  }*/
  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = [30, 60, 90, 180, 360].includes(daysParam) ? daysParam : 30;

  const since = startOfDay(subDays(new Date(), days)).toISOString();

  // TICKETS CREATED
  const [liveCreated, botCreated, toolCreated] = await Promise.all([
    serviceSupabase.from('tickets').select('id', { count: 'exact', head: true }).gte('created_at', since),
    serviceSupabase.from('tickets_ticketsbot').select('id', { count: 'exact', head: true }).gte('created_at', since),
    serviceSupabase.from('tickets_tickettool').select('id', { count: 'exact', head: true }).gte('created_at', since)
  ]);
  const ticketsCreated = (liveCreated.count || 0) + (botCreated.count || 0) + (toolCreated.count || 0);

  // TICKETS CLOSED
  const [liveClosed, botClosed, toolClosed] = await Promise.all([
    serviceSupabase.from('tickets').select('id', { count: 'exact', head: true }).gte('closed_at', since),
    serviceSupabase.from('tickets_ticketsbot').select('id', { count: 'exact', head: true }).gte('closed_at', since),
    serviceSupabase.from('tickets_tickettool').select('id', { count: 'exact', head: true }).gte('closed_at', since)
  ]);
  const ticketsClosed = (liveClosed.count || 0) + (botClosed.count || 0) + (toolClosed.count || 0);

  // STAFF ACTIONS (from all 3 message tables)
  const [liveActions, botActions, toolActions] = await Promise.all([
    serviceSupabase.from('ticket_messages').select('id', { count: 'exact', head: true }).eq('role', 'staff').gte('created_at', since),
    serviceSupabase.from('ticketsbot_messages').select('id', { count: 'exact', head: true }).eq('role', 'staff').gte('created_at', since),
    serviceSupabase.from('tickettool_messages').select('id', { count: 'exact', head: true }).eq('role', 'staff').gte('created_at', since)
  ]);
  const staffActions = (liveActions.count || 0) + (botActions.count || 0) + (toolActions.count || 0);

  // --- LIFETIME TOTALS ---
const [totalCreatedLive, totalCreatedBot, totalCreatedTool] = await Promise.all([
  serviceSupabase.from('tickets').select('id', { count: 'exact', head: true }),
  serviceSupabase.from('tickets_ticketsbot').select('id', { count: 'exact', head: true }),
  serviceSupabase.from('tickets_tickettool').select('id', { count: 'exact', head: true })
]);

const totalTicketsCreated = 
  (totalCreatedLive.count || 0) +
  (totalCreatedBot.count || 0) +
  (totalCreatedTool.count || 0);

const [totalClosedLive, totalClosedBot, totalClosedTool] = await Promise.all([
  serviceSupabase.from('tickets').select('id', { count: 'exact', head: true }).not('closed_at', 'is', null),
  serviceSupabase.from('tickets_ticketsbot').select('id', { count: 'exact', head: true }).not('closed_at', 'is', null),
  serviceSupabase.from('tickets_tickettool').select('id', { count: 'exact', head: true }).not('closed_at', 'is', null)
]);

const totalTicketsClosed =
  (totalClosedLive.count || 0) +
  (totalClosedBot.count || 0) +
  (totalClosedTool.count || 0);

const totalClosedBySource = {
  live: totalClosedLive.count || 0,
  ticketsbot: totalClosedBot.count || 0,
  tickettool: totalClosedTool.count || 0,
};
  

  const claimedBreakdown: Record<string, number> = {};
  const claimedAvatars: Record<string, string> = {};

  // Helper function to fetch daily counts for a given table and date column
  async function getDailyCounts(table: string, selectColumns: string[], dateColumn: string, since: string, filterColumn?: string, filterValue?: string) {
    let query = serviceSupabase.from(table).select(selectColumns.join(','));
    if (filterColumn && filterValue) {
      query = query.eq(filterColumn, filterValue);
    }
    query = query.gte(dateColumn, since);

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching daily counts for ${table} (${dateColumn}):`, error);
      return [];
    }
    return data;
  }

  // Helper to aggregate daily data
  function aggregateDailyData(rawData: { [key: string]: any }[], dateColumn: string, days: number): number[] {
    const dailyCounts: Record<string, number> = {};
    for (const row of rawData) {
      const date = format(startOfDay(new Date(row[dateColumn])), 'yyyy-MM-dd');
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    }

    const history: number[] = [];
    let currentDate = startOfDay(subDays(new Date(), days));
    const endDate = startOfDay(new Date());

    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      history.push(dailyCounts[dateKey] || 0);
      currentDate = addDays(currentDate, 1);
    }
    return history;
  }

  // TICKETS CREATED HISTORY
  const [liveDailyCreated, botDailyCreated, toolDailyCreated] = await Promise.all([
    getDailyCounts('tickets', ['created_at'], 'created_at', since),
    getDailyCounts('tickets_ticketsbot', ['created_at'], 'created_at', since),
    getDailyCounts('tickets_tickettool', ['created_at'], 'created_at', since)
  ]);

  const ticketsCreatedHistory = aggregateDailyData(
    [...liveDailyCreated, ...botDailyCreated, ...toolDailyCreated],
    'created_at',
    days
  );

  // TICKETS CLOSED HISTORY
  const [liveDailyClosed, botDailyClosed, toolDailyClosed] = await Promise.all([
    getDailyCounts('tickets', ['closed_at'], 'closed_at', since),
    getDailyCounts('tickets_ticketsbot', ['closed_at'], 'closed_at', since),
    getDailyCounts('tickets_tickettool', ['closed_at'], 'closed_at', since)
  ]);

  const ticketsClosedHistory = aggregateDailyData(
    [...liveDailyClosed, ...botDailyClosed, ...toolDailyClosed],
    'closed_at',
    days
  );

  // STAFF ACTIONS HISTORY
  const [liveDailyActions, botDailyActions, toolDailyActions] = await Promise.all([
    getDailyCounts('ticket_messages', ['created_at'], 'created_at', since, 'role', 'staff'),
    getDailyCounts('ticketsbot_messages', ['created_at'], 'created_at', since, 'role', 'staff'),
    getDailyCounts('tickettool_messages', ['created_at'], 'created_at', since, 'role', 'staff')
  ]);

  const staffActionsHistory = aggregateDailyData(
    [...liveDailyActions, ...botDailyActions, ...toolDailyActions],
    'created_at',
    days
  );

  // LOGS BY LEVEL HISTORY
  const botLogsHistoryData = await getDailyCounts('bot_logs', ['timestamp', 'level'], 'timestamp', since);
  const logsByLevelHistory: Record<string, number[]> = {};

  const allLogDates = botLogsHistoryData.map((d: any) => ({ // Add any to d to resolve type error
    date: format(startOfDay(new Date(d.timestamp)), 'yyyy-MM-dd'),
    level: d.level
  }));

  const uniqueLevels = Array.from(new Set(allLogDates.map(log => log.level)));

  for (const level of uniqueLevels) {
    const dailyLevelCounts: Record<string, number> = {};
    for (const log of allLogDates.filter(l => l.level === level)) {
      dailyLevelCounts[log.date] = (dailyLevelCounts[log.date] || 0) + 1;
    }

    const history: number[] = [];
    let currentDate = startOfDay(subDays(new Date(), days));
    const endDate = startOfDay(new Date());

    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      history.push(dailyLevelCounts[dateKey] || 0);
      currentDate = addDays(currentDate, 1);
    }
    logsByLevelHistory[level] = history;
  }

  async function fetchAllClaims(table: string) {
    
    const pageSize = 1000;
    const maxRows = 10000; // adjust if needed
    const pages: TicketClaim[] = [];
  
    for (let from = 0; from < maxRows; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await serviceSupabase
        .from(table)
        .select('claimed_by, claimed_by_username')
        .range(from, to)
        .throwOnError();
  
        if (data?.length) pages.push(...(data as TicketClaim[]));
        if (!data || data.length < pageSize) break;
      }
  
    return pages;
  }
  
  const liveClaims = await serviceSupabase.from('tickets').select('claimed_by, claimed_by_username');
  const botClaimsData = await fetchAllClaims('tickets_ticketsbot');
  const toolClaimsData = await fetchAllClaims('tickets_tickettool');
  
  console.log('botClaimsData.length:', botClaimsData.length);
  console.log('toolClaimsData.length:', toolClaimsData.length);

  const allClaimed = [
    ...(liveClaims.data as TicketClaim[] || []).filter(r => r.claimed_by && r.claimed_by !== 'Unclaimed'),
    ...botClaimsData.filter(r => r.claimed_by && r.claimed_by !== 'Unclaimed'),
    ...toolClaimsData.filter(r => r.claimed_by && r.claimed_by !== 'Unclaimed')
  ];
  
    for (const row of allClaimed) {
      const userId = row.claimed_by;
      if (!userId) continue;
    
      const username = staffMap[userId] || row.claimed_by_username || userId;
    
      claimedBreakdown[username] = (claimedBreakdown[username] || 0) + 1;
    
      const envVarName = `${username.toUpperCase()}_AVATAR`;
      const avatarUrl = process.env[envVarName];
      if (avatarUrl) claimedAvatars[username] = avatarUrl;
    }
    console.log('Claimed Breakdown:', claimedBreakdown);
    console.log('Live claims (filtered):', allClaimed.filter(r => r.claimed_by === 'Unclaimed').length)
    console.log('Final allClaimed length:', allClaimed.length)
    if (liveClaims.error) {
      console.error('liveClaims error:', liveClaims.error);
    }
    
const claimedBySource = {
    live: {} as Record<string, number>,
    ticketsbot: {} as Record<string, number>,
    tickettool: {} as Record<string, number>,
  };
    
  for (const row of (liveClaims.data || []).filter(
  r => r.claimed_by && r.claimed_by !== 'Unclaimed'
)) {
    const userId = row.claimed_by;
    if (!userId) continue;
    const username = staffMap[userId] || userId;
    claimedBySource.live[username] = (claimedBySource.live[username] || 0) + 1;
  }
  
  for (const row of botClaimsData.filter(r => r.claimed_by && r.claimed_by !== 'Unclaimed')) {
    const userId = row.claimed_by;
    const username = staffMap[userId] || row.claimed_by_username || userId;
    claimedBySource.ticketsbot[username] = (claimedBySource.ticketsbot[username] || 0) + 1;
  }
  
  for (const row of toolClaimsData.filter(r => r.claimed_by && r.claimed_by !== 'Unclaimed')) {
    const userId = row.claimed_by;
    const username = staffMap[userId] || row.claimed_by_username || userId;
    claimedBySource.tickettool[username] = (claimedBySource.tickettool[username] || 0) + 1;
  }
  console.log('Claimed bySource:', claimedBySource);

  // CLOSED BY USERNAME
  const closedBreakdown: Record<string, number> = {};
  const closedAvatars: Record<string, string> = {};

  async function fetchAllClosed(table: string) {
    const pageSize = 1000;
    const maxRows = 10000;
    const pages: TicketClose[] = [];

    for (let from = 0; from < maxRows; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await serviceSupabase
        .from(table)
        .select(table === 'tickets' ? 'closed_by_id, closed_by_username' : 'closed_by, closed_by_username')
        .not('closed_at', 'is', null) // Only count closed tickets
        .range(from, to)
        .throwOnError();

      if (data?.length) pages.push(...(data as TicketClose[]));
      if (!data || data.length < pageSize) break;
    }
    return pages;
  }

  const liveClosedData = await serviceSupabase.from('tickets').select('closed_by_id, closed_by_username').not('closed_at', 'is', null);
  const botClosedData = await fetchAllClosed('tickets_ticketsbot');
  const toolClosedData = await fetchAllClosed('tickets_tickettool');

  const allClosed = [
    ...(liveClosedData.data as TicketClose[] || []).filter(r => r.closed_by_id), // Filter by closed_by_id for 'tickets' table
    ...botClosedData.filter(r => r.closed_by),
    ...toolClosedData.filter(r => r.closed_by)
  ];

  const NON_STAFF_USER = "non-staff user";
  const GENERIC_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png'; // Default Discord avatar

  for (const row of allClosed) {
    const userId = row.closed_by || row.closed_by_id; // Use closed_by_id for 'tickets' table
    if (!userId) continue;

    let username: string;
    if (staffMap[userId]) {
      username = staffMap[userId];
    } else {
      username = NON_STAFF_USER;
    }

    closedBreakdown[username] = (closedBreakdown[username] || 0) + 1;

    if (username === NON_STAFF_USER) {
      closedAvatars[username] = GENERIC_AVATAR;
    } else {
      const envVarName = `${username.toUpperCase()}_AVATAR`;
      const avatarUrl = process.env[envVarName];
      if (avatarUrl) closedAvatars[username] = avatarUrl;
    }
  }
  console.log('Closed Breakdown:', closedBreakdown);
    
  async function fetchAllBotLogs(since: string) {
    const pageSize = 1000;
    const maxRows = 50000; // Increased maxRows for logs, adjust as needed
    const pages: { level: string }[] = [];

    for (let from = 0; from < maxRows; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await serviceSupabase
        .from('bot_logs')
        .select('level')
        .gte('timestamp', since)
        .range(from, to)
        .throwOnError();

      if (data?.length) pages.push(...(data as { level: string }[]));
      if (!data || data.length < pageSize) break;
    }
    return pages;
  }

  // BOT LOGS (live only)
  const allBotLogs = await fetchAllBotLogs(since);

  const logsByLevel: Record<string, number> = {};
  for (const log of allBotLogs) {
    logsByLevel[log.level] = (logsByLevel[log.level] || 0) + 1;
  }

  const openTickets = totalTicketsCreated - totalTicketsClosed;

  // Ticket Type Breakdown (from live tickets)
  const { data: ticketTypes, error: ticketTypesError } = await serviceSupabase
    .from('tickets')
    .select('ticket_type');

  if (ticketTypesError) {
    console.error('Error fetching ticket types:', ticketTypesError);
  }

  const ticketTypeBreakdown: Record<string, number> = {};
  if (ticketTypes) {
    for (const ticket of ticketTypes) {
      if (ticket.ticket_type) {
        ticketTypeBreakdown[ticket.ticket_type] = (ticketTypeBreakdown[ticket.ticket_type] || 0) + 1;
      }
    }
  }

  return NextResponse.json({
    days,
    ticketsCreated,
    ticketsClosed,
    staffActions,
    logsByLevel,
    totalTicketsCreated,
    totalTicketsClosed,
    openTickets,
    claimedBreakdown,
    claimedBySource,
    claimedAvatars,
    closedBreakdown,
    closedAvatars,
    ticketsCreatedHistory,
    ticketsClosedHistory,
    staffActionsHistory,
    logsByLevelHistory,
    ticketTypeBreakdown,
    totalClosedBySource
  });
}
