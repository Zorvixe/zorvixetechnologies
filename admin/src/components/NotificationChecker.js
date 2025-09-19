import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { apiGetNotificationCount } from '../api';

const NotificationChecker = ({ onNewNotifications, onNewTickets, checkInterval = 30000 }) => {
  const { user } = useAuth();
  const [previousCounts, setPreviousCounts] = useState({ notifications: 0, tickets: 0 });

  useEffect(() => {
    if (!user) return;

    const checkNotifications = async () => {
      try {
        const counts = await apiGetNotificationCount();
        
        // Check if there are new notifications since last check
        if (counts.notifications > previousCounts.notifications) {
          onNewNotifications(counts.notifications - previousCounts.notifications);
        }
        
        // Check if there are new tickets since last check
        if (counts.tickets > previousCounts.tickets) {
          onNewTickets(counts.tickets - previousCounts.tickets);
        }
        
        setPreviousCounts(counts);
      } catch (error) {
        console.error('Error checking notifications:', error);
      }
    };

    // Check immediately
    checkNotifications();
    
    // Set up interval for periodic checking
    const interval = setInterval(checkNotifications, checkInterval);
    
    return () => clearInterval(interval);
  }, [user, previousCounts, onNewNotifications, onNewTickets, checkInterval]);

  return null;
};

export default NotificationChecker;