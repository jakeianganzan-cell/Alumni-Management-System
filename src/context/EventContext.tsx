import { createContext, useContext, ReactNode, useState, useEffect } from 'react';

export interface Event {
  id: string;
  title: string;
  date: string;
  description: string;
  comments: Comment[];
}

export interface Comment {
  id: string;
  text: string;
  author: string;
}

interface EventContextType {
  events: Event[];
  addEvent: (event: Omit<Event, 'comments'>) => void;
  addComment: (eventId: string, comment: Omit<Comment, 'id'>) => void;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export function EventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Event[]>([]);

  const addEvent = (event: Omit<Event, 'comments'>) => {
    setEvents(prev => [...prev, { ...event, id: Date.now().toString(), comments: [] }]);
  };

  const addComment = (eventId: string, comment: Omit<Comment, 'id'>) => {
    setEvents(prev => prev.map(event => 
      event.id === eventId 
        ? { ...event, comments: [...event.comments, { ...comment, id: Date.now().toString() }] }
        : event
    ));
  };

  return (
    <EventContext.Provider value={{ events, addEvent, addComment }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEvents() {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
}
