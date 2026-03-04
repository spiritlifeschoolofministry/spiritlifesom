export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMilliseconds: number;
  isExpired: boolean;
  isUrgent: boolean; // Less than 24 hours
}

export const calculateTimeRemaining = (dueDate: string | null): TimeRemaining => {
  if (!dueDate) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalMilliseconds: 0,
      isExpired: false,
      isUrgent: false,
    };
  }

  const now = new Date().getTime();
  const due = new Date(dueDate).getTime();
  const diffMs = due - now;

  const isExpired = diffMs <= 0;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const isUrgent = totalSeconds > 0 && totalSeconds < 86400; // Less than 24 hours

  return {
    days,
    hours,
    minutes,
    seconds,
    totalMilliseconds: Math.max(0, diffMs),
    isExpired,
    isUrgent,
  };
};

export const formatTimeRemaining = (timeRemaining: TimeRemaining): string => {
  if (timeRemaining.isExpired) {
    return 'Deadline Expired';
  }

  const parts = [];
  if (timeRemaining.days > 0) {
    parts.push(`${timeRemaining.days} day${timeRemaining.days !== 1 ? 's' : ''}`);
  }
  if (timeRemaining.hours > 0) {
    parts.push(`${timeRemaining.hours} hour${timeRemaining.hours !== 1 ? 's' : ''}`);
  }
  if (parts.length === 0 && timeRemaining.minutes > 0) {
    parts.push(`${timeRemaining.minutes} minute${timeRemaining.minutes !== 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return `${timeRemaining.seconds} second${timeRemaining.seconds !== 1 ? 's' : ''}`;
  }

  return `${parts.join(', ')} remaining`;
};
