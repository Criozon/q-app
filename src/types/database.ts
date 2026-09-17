export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      queue_access: {
        Row: {
          granted_at: string
          id: string
          queue_id: string
          role: string
          user_id: string
          window_id: string | null
        }
        Insert: {
          granted_at?: string
          id?: string
          queue_id: string
          role: string
          user_id: string
          window_id?: string | null
        }
        Update: {
          granted_at?: string
          id?: string
          queue_id?: string
          role?: string
          user_id?: string
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_access_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_access_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "windows"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_announcements: {
        Row: {
          body: string
          created_at: string
          id: string
          queue_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          queue_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_announcements_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_members: {
        Row: {
          acknowledged_at: string | null
          assigned_window_id: string | null
          called_at: string | null
          created_at: string
          defer_count: number
          display_code: string | null
          id: string
          member_name: string
          note: string | null
          queue_id: string
          service_id: string | null
          serviced_at: string | null
          sort_order: number
          status: string
          ticket_number: number
          timer_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_window_id?: string | null
          called_at?: string | null
          created_at?: string
          defer_count?: number
          display_code?: string | null
          id?: string
          member_name: string
          note?: string | null
          queue_id: string
          service_id?: string | null
          serviced_at?: string | null
          sort_order: number
          status?: string
          ticket_number: number
          timer_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          assigned_window_id?: string | null
          called_at?: string | null
          created_at?: string
          defer_count?: number
          display_code?: string | null
          id?: string
          member_name?: string
          note?: string | null
          queue_id?: string
          service_id?: string | null
          serviced_at?: string | null
          sort_order?: number
          status?: string
          ticket_number?: number
          timer_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_members_assigned_window_id_fkey"
            columns: ["assigned_window_id"]
            isOneToOne: false
            referencedRelation: "windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_members_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_members_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      queues: {
        Row: {
          admin_secret_key: string
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string | null
          short_id: string
          status: string
          updated_at: string | null
          window_count: number
        }
        Insert: {
          admin_secret_key?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          short_id?: string
          status?: string
          updated_at?: string | null
          window_count?: number
        }
        Update: {
          admin_secret_key?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          short_id?: string
          status?: string
          updated_at?: string | null
          window_count?: number
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          id: string
          name: string
          queue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          queue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      window_services: {
        Row: {
          service_id: string
          window_id: string
        }
        Insert: {
          service_id: string
          window_id: string
        }
        Update: {
          service_id?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "window_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "window_services_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "windows"
            referencedColumns: ["id"]
          },
        ]
      }
      windows: {
        Row: {
          created_at: string
          id: string
          name: string
          queue_id: string
          short_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          queue_id: string
          short_key: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          queue_id?: string
          short_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "windows_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_windows_to_queue: {
        Args: { p_new_window_count: number; p_queue_id: string }
        Returns: undefined
      }
      avg_service_minutes: { Args: { p_queue_id: string }; Returns: number }
      call_next_member_to_window: {
        Args: { p_window_id: string }
        Returns: string
      }
      claim_queue_admin: {
        Args: { p_secret_key: string }
        Returns: {
          admin_secret_key: string
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string | null
          short_id: string
          status: string
          updated_at: string | null
          window_count: number
        }
        SetofOptions: {
          from: "*"
          to: "queues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_window_operator: { Args: { p_short_key: string }; Returns: Json }
      create_queue_with_services_and_windows: {
        Args: {
          p_description: string
          p_name: string
          p_services: Json
          p_window_count: number
        }
        Returns: {
          admin_secret_key: string
          id: string
          name: string
        }[]
      }
      defer_my_call: {
        Args: { p_member_id: string; p_skip?: number }
        Returns: {
          acknowledged_at: string | null
          assigned_window_id: string | null
          called_at: string | null
          created_at: string
          defer_count: number
          display_code: string | null
          id: string
          member_name: string
          note: string | null
          queue_id: string
          service_id: string | null
          serviced_at: string | null
          sort_order: number
          status: string
          ticket_number: number
          timer_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "queue_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      extend_member_timer: {
        Args: { p_member_id: string; p_minutes: number }
        Returns: {
          acknowledged_at: string | null
          assigned_window_id: string | null
          called_at: string | null
          created_at: string
          defer_count: number
          display_code: string | null
          id: string
          member_name: string
          note: string | null
          queue_id: string
          service_id: string | null
          serviced_at: string | null
          sort_order: number
          status: string
          ticket_number: number
          timer_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "queue_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_short_id: { Args: { size?: number }; Returns: string }
      get_my_queue_status: { Args: { p_member_id: string }; Returns: Json }
      get_queue_details_for_joining: {
        Args: { p_queue_id: string }
        Returns: Json
      }
      get_queue_for_join: { Args: { p_short_id: string }; Returns: Json }
      get_queue_stats: { Args: { p_queue_id: string }; Returns: Json }
      get_window_admin_initial_data: {
        Args: { p_short_key: string }
        Returns: Json
      }
      has_queue_access: {
        Args: { p_queue_id: string; p_role?: string }
        Returns: boolean
      }
      is_queue_member: { Args: { p_queue_id: string }; Returns: boolean }
      join_queue: {
        Args: {
          p_member_name: string
          p_service_id?: string
          p_short_id: string
        }
        Returns: {
          acknowledged_at: string | null
          assigned_window_id: string | null
          called_at: string | null
          created_at: string
          defer_count: number
          display_code: string | null
          id: string
          member_name: string
          note: string | null
          queue_id: string
          service_id: string | null
          serviced_at: string | null
          sort_order: number
          status: string
          ticket_number: number
          timer_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "queue_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_window_id: { Args: { p_queue_id: string }; Returns: string }
      set_services_for_window: {
        Args: { p_service_ids: string[]; p_window_id: string }
        Returns: undefined
      }
      start_member_session: {
        Args: { p_member_id: string; p_minutes?: number; p_note?: string }
        Returns: {
          acknowledged_at: string | null
          assigned_window_id: string | null
          called_at: string | null
          created_at: string
          defer_count: number
          display_code: string | null
          id: string
          member_name: string
          note: string | null
          queue_id: string
          service_id: string | null
          serviced_at: string | null
          sort_order: number
          status: string
          ticket_number: number
          timer_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "queue_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_service_window_assignments: {
        Args: { p_service_id: string; p_window_ids: string[] }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
