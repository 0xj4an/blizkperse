export interface Database {
  public: {
    Tables: {
      organizers: {
        Row: {
          id: string;
          name: string;
          owner_address: string;
          total_distributed: number;
          subscriber_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_address: string;
          total_distributed?: number;
          subscriber_count?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          owner_address?: string;
          total_distributed?: number;
          subscriber_count?: number;
        };
      };
      subscribers: {
        Row: {
          id: string;
          address: string;
          name: string;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          address: string;
          name: string;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          address?: string;
          name?: string;
          email?: string | null;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          organizer_id: string;
          subscriber_id: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organizer_id: string;
          subscriber_id: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          status?: string;
        };
      };
      payouts: {
        Row: {
          id: string;
          organizer_id: string;
          total_amount: number;
          status: string;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organizer_id: string;
          total_amount: number;
          status?: string;
          tx_hash?: string | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          tx_hash?: string | null;
        };
      };
      payments: {
        Row: {
          id: string;
          payout_id: string;
          organizer_id: string;
          subscriber_id: string;
          amount: number;
          status: string;
          claimed_at: string | null;
          tx_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          payout_id: string;
          organizer_id: string;
          subscriber_id: string;
          amount: number;
          status?: string;
          claimed_at?: string | null;
          tx_hash?: string | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          claimed_at?: string | null;
          tx_hash?: string | null;
        };
      };
    };
  };
}
