'use client';

import { useState, useEffect, useMemo } from 'react';

interface Channel {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name: string | null;
}

interface Announcement {
  id: number;
  channel_id: string;
  message: string;
  reply_to_message_id: string | null;
  created_at: string;
  sent_by: string;
}

export default function AnnouncementsClient() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [message, setMessage] = useState('');
  const [replyToMessageId, setReplyToMessageId] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('/api/admin/get-announcements');
      if (!response.ok) {
        throw new Error('Failed to fetch announcements');
      }
      const data = await response.json();
      setAnnouncements(data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    }
  };

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const response = await fetch('/api/admin/get-channels', {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Failed to fetch channels');
        }
        const data = await response.json();
        setChannels(data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred');
        }
      }
    };

    fetchChannels();
    fetchAnnouncements();
  }, []);

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: selectedChannel?.id,
          message,
          replyToMessageId: replyToMessageId || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setMessage('');
      setReplyToMessageId('');
      setSelectedChannel(null);
      fetchAnnouncements();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const groupedChannels = useMemo(() => {
    const groups: { [key: string]: Channel[] } = {};
    channels.forEach(channel => {
      const categoryName = channel.parent_name || 'No Category';
      if (!groups[categoryName]) {
        groups[categoryName] = [];
      }
      groups[categoryName].push(channel);
    });
    return groups;
  }, [channels]);

  const filteredChannels = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const filtered: { [key: string]: Channel[] } = {};

    Object.entries(groupedChannels).forEach(([category, chans]) => {
      const matchingChannels = chans.filter(channel =>
        channel.name.toLowerCase().includes(lowerCaseSearchTerm)
      );
      if (matchingChannels.length > 0) {
        filtered[category] = matchingChannels;
      }
    });
    return filtered;
  }, [searchTerm, groupedChannels]);

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    setSearchTerm(channel.name);
    setIsDropdownOpen(false);
  };

  return (
    <div className="p-6 bg-gray-900 text-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-white">Admin - Announcements</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Channel Selection and Message Form */}
        <div>
          <div className="mb-6">
            <label htmlFor="channel-select" className="block text-sm font-medium text-gray-300 mb-2">
              Channel
            </label>
            <div className="relative">
              <input
                type="text"
                id="channel-select"
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-100 placeholder-gray-400 cursor-pointer"
                placeholder={selectedChannel ? selectedChannel.name : "Select a channel"}
                value={isDropdownOpen ? searchTerm : (selectedChannel?.name ?? searchTerm)}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsDropdownOpen(false), 100)}
              />
              {isDropdownOpen && (
                <div className="absolute z-10 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {Object.keys(filteredChannels).length === 0 ? (
                    <div className="p-3 text-gray-400">No channels found.</div>
                  ) : (
                    Object.entries(filteredChannels).map(([category, chans]) => (
                      <div key={category}>
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-700 sticky top-0 bg-gray-800">
                          {category}
                        </div>
                        {chans.map((channel) => (
                          <div
                            key={channel.id}
                            role="option"
                            tabIndex={0}
                            aria-selected={selectedChannel?.id === channel.id}
                            className="p-3 hover:bg-indigo-700 cursor-pointer flex items-center space-x-2"
                            onMouseDown={() => handleSelectChannel(channel)}
                            onClick={() => handleSelectChannel(channel)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectChannel(channel);
                              }
                            }}
                          >
                            <span className="text-gray-300">{channel.name}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="reply-to-id" className="block text-sm font-medium text-gray-300 mb-2">
              Reply to Message ID (Optional)
            </label>
            <input
              type="text"
              id="reply-to-id"
              value={replyToMessageId}
              onChange={(e) => setReplyToMessageId(e.target.value)}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-100 placeholder-gray-400"
              placeholder="Enter message ID to reply to"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="message-content" className="block text-sm font-medium text-gray-300 mb-2">
              Message
            </label>
            <textarea
              id="message-content"
              rows={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-100 placeholder-gray-400"
              placeholder="Type your announcement message here..."
            />
          </div>

          <button
            onClick={handleSend}
            disabled={loading || !selectedChannel || !message}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 ease-in-out"
          >
            {loading ? 'Sending...' : 'Send Announcement'}
          </button>

          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        </div>

        {/* Right Column: Recent Announcements */}
        <div>
          <h2 className="text-2xl font-bold mb-6 text-white">Recent Announcements</h2>
          <div className="space-y-4">
            {announcements.length === 0 ? (
              <p className="text-gray-400">No recent announcements.</p>
            ) : (
              announcements.map((announcement) => (
                <div key={announcement.id} className="p-4 bg-gray-800 border border-gray-700 rounded-md shadow-sm">
                  <p className="text-sm text-gray-400 mb-1">
                    <span className="font-medium text-indigo-400">Channel:</span> {channels.find(c => c.id === announcement.channel_id)?.name || announcement.channel_id}
                  </p>
                  <p className="text-sm text-gray-400 mb-1">
                    <span className="font-medium text-indigo-400">Sent At:</span> {new Date(announcement.created_at).toLocaleString()}
                  </p>
                  {announcement.reply_to_message_id && (
                    <p className="text-sm text-gray-400 mb-1">
                      <span className="font-medium text-indigo-400">Reply to:</span> {announcement.reply_to_message_id}
                    </p>
                  )}
                  <p className="mt-3 text-gray-200">{announcement.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
