'use client'

import { useState, useEffect } from 'react';

interface NodeForgoTicket {
  id: string;
  created_at: string | null;
  closed_at: string | null;
  claimed_by: string | null;
  claimed_by_username: string | null;
  closed_by: string | null;
  closed_by_username: string | null;
  close_reason: string | null;
  description: string | null;
  status: string; // Keep existing status for overall ticket state if needed
  program_status: string | null; // Add new program_status
  ticket_type: string | null;
  discord_username: string;
  full_name: string | null;
  email: string | null;
  order_number: string | null;
  algorand_address: string | null;
  minerkeys: string | null;
  user_id: string | null;
  transcriptSource: string;
  channel_id: string | null;
  scheduled_close_at: string | null;
  is_transcribed: boolean | null;
  original_category_id: string | null;
  transcript_preference: string | null;
  original_message_id: string | null;
  selected_region: string | null;
  bold_sign_signed: boolean | null;
  sn_picture_confirmed: boolean | null;
  factory_reset_picture_confirmed: boolean | null;
  orders_quantities: { order: string; quantity: number }[] | null; // Define a more specific type if possible
  request_type: string | null;
  registration_waived: boolean | null; 
  validated: boolean | null;
  validated_by: string | null;
  coupon_code: string | null;
}

interface NodeForgoTableProps {
  tickets: NodeForgoTicket[];
  accessToken: string | null;
  forgoCount: number; // Add forgoCount to props
  returnCount: number; // Add returnCount to props
  triggerRefresh: () => void; // Add triggerRefresh to props
}

export default function NodeForgoTable({ tickets, accessToken, forgoCount, returnCount, triggerRefresh }: NodeForgoTableProps) {
  const [sortedTickets, setSortedTickets] = useState<NodeForgoTicket[]>(tickets);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null); // State to manage open dropdown

  const toggleDropdown = (ticketId: string) => {
    setOpenDropdownId(openDropdownId === ticketId ? null : ticketId);
  };

  const handleStatusUpdate = async (event: React.MouseEvent<HTMLButtonElement>, ticketId: string, newStatus: string) => {
    event.preventDefault(); // Prevent default form submission behavior

    console.log(`Attempting to update ticket ${ticketId} to status ${newStatus}`); // Added log

    if (!accessToken) {
      console.error("Access token not available.");
      return;
    }

    try {
      const res = await fetch('/api/update-ticket-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ ticketId, newStatus, column: 'program_status' }) // Specify program_status column
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Failed to update ticket status: ${res.status} ${errorText}`);
        // TODO: Show an error message to the user
        return;
      }
    
      /*
      // Update the ticket program status in the local state
      setSortedTickets(prevTickets =>
        prevTickets.map(ticket =>
          ticket.id === ticketId ? { ...ticket, program_status: newStatus } : ticket
        )
      );
      */
     
      setOpenDropdownId(null); // Close the dropdown

      // Trigger a refresh of the data in the parent component
      triggerRefresh();

      // TODO: Show a success message to the user

    } catch (error) {
      console.error("Error updating ticket status:", error);
      // TODO: Show an error message to the user
    }
  };

  const [sortConfig, setSortConfig] = useState<{ key: keyof NodeForgoTicket; direction: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setSortedTickets(tickets);
  }, [tickets]);

  const handleSort = (key: keyof NodeForgoTicket) => {
    let direction = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const sortedData = [...sortedTickets].sort((a, b) => {
      const aValue = a[key];
      const bValue = b[key];

      if (aValue === null || aValue === undefined) return direction === 'ascending' ? 1 : -1;
      if (bValue === null || bValue === undefined) return direction === 'ascending' ? -1 : 1;

      if (aValue < bValue) {
        return direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
    setSortedTickets(sortedData);
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const filteredTickets = sortedTickets.filter(ticket =>
    Object.values(ticket).some(value =>
      value !== null && value !== undefined && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Function to get the status badge based on the ticket status
  const getStatusBadge = (status: string | null) => {
    if (!status) return 'N/A';
    let colorClass = 'bg-gray-500'; // Default color

    switch (status.toLowerCase()) {
      case 'open':
      case 'waiting for nft':
        colorClass = 'bg-blue-500';
        break;
      case 'closed':
      case '50% coupon issued':
        colorClass = 'bg-green-500';
        break;
      case 'pending':
        colorClass = 'bg-yellow-500';
        break;
      case 'rejected':
        colorClass = 'bg-red-500';
        break;
      default:
        colorClass = 'bg-gray-500';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${colorClass}`}>
        {status}
      </span>
    );
  };
  // Function to export tickets to CSV
  const exportToCsv = () => {
    const headers = [
      'Ticket ID', 'Date Opened', 'Discord Username', 'Discord ID', 'Order Number(s)',
      'Order #(s) and Quantity', 'Request Type', 'Reg. Waived', 'Ticket Status',
      'Region/Country (Returns)', 'Forgo/Return Status', 'Algorand Wallet', 'Coupon Code',
      'SN Picture Confirmed', 'Factory Reset Picture Confirmed', 'BoldSign Status', 'Validated',
      'Validated By', 'Closed at:'
    ];

    const rows = filteredTickets.map(ticket => {
      const ordersQuantitiesFormatted = (() => {
        try {
          if (!ticket.orders_quantities) return '';
          const parsedQuantities = typeof ticket.orders_quantities === 'string' 
            ? JSON.parse(ticket.orders_quantities) 
            : ticket.orders_quantities;

          if (Array.isArray(parsedQuantities) && parsedQuantities.length > 0) {
            return parsedQuantities.map(item => `Order: ${item.order}, Qty: ${item.quantity}`).join('; ');
          }
          return '';
        } catch (error) {
          console.error('Error parsing orders_quantities for CSV:', error);
          return 'Error';
        }
      })();

      return [
        ticket.id,
        ticket.created_at ? new Date(ticket.created_at).toLocaleString() : '',
        ticket.discord_username,
        ticket.user_id,
        ticket.order_number,
        ordersQuantitiesFormatted,
        ticket.request_type,
        ticket.registration_waived === true ? 'Yes' : 'No',
        ticket.status,
        ticket.selected_region,
        ticket.program_status || '',
        ticket.algorand_address,
        ticket.coupon_code || '',
        ticket.sn_picture_confirmed === true ? 'Yes' : 'No',
        ticket.factory_reset_picture_confirmed === true ? 'Yes' : 'No',
        ticket.bold_sign_signed === true ? 'Signed' : ticket.bold_sign_signed === false ? 'Waiting' : 'N/A',
        ticket.validated === true ? 'Yes' : 'No',
        ticket.validated_by || '',
        ticket.closed_at ? new Date(ticket.closed_at).toLocaleString() : ''
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','); // Enclose fields in quotes and escape existing quotes
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) { // Feature detection for download attribute
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'node_forgo_tickets.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const renderSortIndicator = (key: keyof NodeForgoTicket) => {
    if (sortConfig && sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    }
    return null;
  };

  return (
    <div className="p-6"> {/* Adjusted padding to match TicketList.tsx */}
      <div className="top-2 z-30 bg-black/12 backdrop-blur border-b border-white/10 px-3 py-2"> {/* Header content container */}
        <h2 className="text-2xl font-semibold text-white mb-4">Node Forgo Program Tickets</h2>
        <div className="mb-8 text-white">
          <p>Total Forgo Requests: {forgoCount}</p>
          <p>Total Return Requests: {returnCount}</p>
        </div>      
        <div className="mb-4 flex justify-between items-center">
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={handleSearch}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-white"
          />
          <button
            onClick={exportToCsv}
            className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Export to CSV
          </button>
        </div>
      </div> {/* End header content container */}
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto overflow-x-auto"> {/* New scrollable wrapper */}
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="sticky top-0 z-10 bg-gray-900"> {/* Sticky header */}
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-0 cursor-pointer" onClick={() => handleSort('id')}>
                      Ticket ID {renderSortIndicator('id')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('created_at')}>
                      Date Opened {renderSortIndicator('created_at')}
                    </th>                  
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('discord_username')}>
                      Discord username {renderSortIndicator('discord_username')}
                    </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      Discord ID
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('order_number')}>
                      Order Number(s) {renderSortIndicator('order_number')}
                    </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      Order #(s) and Quantity
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('request_type')}>
                      Request Type {renderSortIndicator('request_type')}
                    </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('registration_waived')}> {/* Added header for Reg. Waived */}
                      Reg. Waived {renderSortIndicator('registration_waived')}
                    </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('status')}> {/* Added header for Overall Status */}
                      Ticket Status {renderSortIndicator('status')}
                    </th>                  
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('selected_region')}>
                      Region/Country (Returns) {renderSortIndicator('selected_region')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('status')}>
                      Forgo/Return Status {renderSortIndicator('status')}
                    </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      Algorand Wallet
                     </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      Coupon Code
                     </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      SN Picture Confirmed
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      Factory Reset Picture Confirmed
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      BoldSign Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      Validated
                    </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                      Validated By
                    </th>
                     <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white cursor-pointer" onClick={() => handleSort('closed_at')}>
                      Closed at: {renderSortIndicator('closed_at')}
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredTickets.map((ticket) => (
                    <tr key={ticket.id} className="odd:bg-gray-800 even:bg-gray-900 hover:bg-gray-700"> {/* Added zebra striping and hover effect */}
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-0">
                        {ticket.id}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.discord_username}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.user_id}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.order_number}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {(() => {
                          try {
                            if (!ticket.orders_quantities) return 'N/A';
                            // Ensure orders_quantities is parsed if it's a string
                            const parsedQuantities = typeof ticket.orders_quantities === 'string' 
                              ? JSON.parse(ticket.orders_quantities) 
                              : ticket.orders_quantities;

                            if (Array.isArray(parsedQuantities) && parsedQuantities.length > 0) {
                              return (
                                <ul className="list-disc list-inside">
                                  {parsedQuantities.map((item, index) => (
                                    <li key={index}>
                                      Order #: {item.order}, Qty: {item.quantity}
                                    </li>
                                  ))}
                                </ul>
                              );
                            }
                            return 'N/A';
                          } catch (error) {
                            console.error('Error parsing orders_quantities:', error);
                            return 'Error';
                          }
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.request_type}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300"> {/* Added data cell for Reg. Waived */}
                        {ticket.registration_waived === true ? '✅' : '—'}
                      </td>                    
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300"> {/* Added data cell for Overall Status */}
                        {getStatusBadge(ticket.status)}
                      </td>                    
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.selected_region}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {getStatusBadge(ticket.program_status)} {/* Display program_status */}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.algorand_address}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.sn_picture_confirmed === true ? '✅' : '❌'}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.factory_reset_picture_confirmed === true ? '✅' : '❌'}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.coupon_code ? (
                          <div className="group relative inline-block">
                            ✅
                            <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gray-800 text-white text-xs rounded py-1 px-2 absolute z-10 top-full left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                              {ticket.coupon_code}
                              <button
                                onClick={() => navigator.clipboard.writeText(ticket.coupon_code || '')}
                                className="ml-2 text-blue-400 hover:text-blue-600"
                                title="Copy coupon code"
                              >
                                Copy
                              </button>
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.bold_sign_signed === true ? 'Signed' : ticket.bold_sign_signed === false ? 'Waiting' : 'N/A'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                         {ticket.validated === true ? '✅' : '❌'} {/* Display checkmark or cross */}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                         {ticket.validated_by || 'N/A'} {/* Display validated_by */}
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {ticket.closed_at ? new Date(ticket.closed_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                        {/* Quick Action Dropdown */}
                        <div className="relative inline-block text-left">
                          <div>
                            <button
                              type="button"
                              className="inline-flex justify-center w-full rounded-md border border-gray-600 shadow-sm px-4 py-2 bg-gray-700 text-sm font-medium text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-indigo-500"
                              id={`actions-menu-${ticket.id}`}
                              aria-haspopup="true"
                              aria-expanded={openDropdownId === ticket.id ? 'true' : 'false'}
                              onClick={() => toggleDropdown(ticket.id)}
                            >
                              Actions
                              {/* Heroicon name: chevron-down */}
                              <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>

                          {/* Dropdown menu */}
                          {openDropdownId === ticket.id && (
                            <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-20" role="menu" aria-orientation="vertical" aria-labelledby={`actions-menu-${ticket.id}`}>
                              <div className="py-1" role="none">
                                {ticket.request_type === 'return' && (
                                  <>
                                    <button
                                      onClick={(e) => handleStatusUpdate(e, ticket.id, '50% Coupon Issued')} // Pass event object
                                      className="text-gray-200 block px-4 py-2 text-sm w-full text-left hover:bg-gray-700"
                                      role="menuitem"
                                    >
                                      Mark as Coupon Issued
                                    </button>
                                    <button
                                      onClick={(e) => handleStatusUpdate(e, ticket.id, 'Waiting for NFT')} // Pass event object
                                      className="text-gray-200 block px-4 py-2 text-sm w-full text-left hover:bg-gray-700"
                                      role="menuitem"
                                    >
                                      Mark as Label Sent
                                    </button>
                                  </>
                                )}
                                {ticket.request_type === 'forgo' && (
                                  <button
                                    onClick={(e) => handleStatusUpdate(e, ticket.id, 'Waiting for NFT')} // Pass event object
                                    className="text-gray-200 block px-4 py-2 text-sm w-full text-left hover:bg-gray-700"
                                    role="menuitem"
                                  >
                                    Mark as Coupon Issued
                                  </button>
                                )}
                                {/* Add other potential actions here */}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
