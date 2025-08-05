'use client';

import { useState, useEffect } from 'react';

interface Channel {
  id: string;
  name: string;
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
  const [selectedChannel, setSelectedChannel] = useState('');
  const [message, setMessage] = useState('');
  const [replyToMessageId, setReplyToMessageId] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          credentials: 'include', // Include cookies for server-side auth
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
          channelId: selectedChannel,
          message,
          replyToMessageId: replyToMessageId || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setMessage('');
      setReplyToMessageId('');
      fetchAnnouncements(); // Refresh announcements list
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

  return (
    <div>
      <div className="mb-4">
        <label htmlFor="channel-select" className="block text-sm font-medium text-gray-700">
          Channel
        </label>
        <select
          id="channel-select"
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          <option value="">Select a channel</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor="reply-to-id" className="block text-sm font-medium text-gray-700">
          Reply to Message ID (Optional)
        </label>
        <input
          type="text"
          id="reply-to-id"
          value={replyToMessageId}
          onChange={(e) => setReplyToMessageId(e.target.value)}
          className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="message-content" className="block text-sm font-medium text-gray-700">
          Message
        </label>
        <textarea
          id="message-content"
          rows={10}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
        />
      </div>

      <button
        onClick={handleSend}
        disabled={loading || !selectedChannel || !message}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Send'}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Recent Announcements</h2>
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="p-4 border rounded-md">
              <p className="text-sm text-gray-500">
                Channel: {channels.find(c => c.id === announcement.channel_id)?.name || announcement.channel_id} | {new Date(announcement.created_at).toLocaleString()}
              </p>
              {announcement.reply_to_message_id && (
                <p className="text-sm text-gray-500">
                  Reply to: {announcement.reply_to_message_id}
                </p>
              )}
              <p className="mt-2">{announcement.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
