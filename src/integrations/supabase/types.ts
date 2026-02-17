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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      clipbeam_admin_attempts: {
        Row: {
          created_at: string
          id: number
          ip: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: number
          ip?: string | null
          success: boolean
        }
        Update: {
          created_at?: string
          id?: number
          ip?: string | null
          success?: boolean
        }
        Relationships: []
      }
      clipbeam_admin_settings: {
        Row: {
          announcement_body: string | null
          announcement_enabled: boolean
          announcement_title: string | null
          id: number
          lockdown_enabled: boolean
          session_ttl_hours: number
          updated_at: string
        }
        Insert: {
          announcement_body?: string | null
          announcement_enabled?: boolean
          announcement_title?: string | null
          id?: number
          lockdown_enabled?: boolean
          session_ttl_hours?: number
          updated_at?: string
        }
        Update: {
          announcement_body?: string | null
          announcement_enabled?: boolean
          announcement_title?: string | null
          id?: number
          lockdown_enabled?: boolean
          session_ttl_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      clipbeam_cleanup_events: {
        Row: {
          created_at: string
          deleted_bytes: number
          deleted_items: number
          id: number
        }
        Insert: {
          created_at?: string
          deleted_bytes: number
          deleted_items: number
          id?: number
        }
        Update: {
          created_at?: string
          deleted_bytes?: number
          deleted_items?: number
          id?: number
        }
        Relationships: []
      }
      clipbeam_items: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          session_id: string
          text_content: string | null
          type: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          session_id: string
          text_content?: string | null
          type: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          session_id?: string
          text_content?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clipbeam_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "clipbeam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      clipbeam_join_attempts: {
        Row: {
          created_at: string
          id: number
          ip: Json
          session_code: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: number
          ip: Json
          session_code?: string | null
          success: boolean
        }
        Update: {
          created_at?: string
          id?: number
          ip?: Json
          session_code?: string | null
          success?: boolean
        }
        Relationships: []
      }
      clipbeam_sessions: {
        Row: {
          code: string
          created_at: string
          created_ip: Json | null
          ended_at: string | null
          id: string
          last_activity_at: string
          pin_hash: string
        }
        Insert: {
          code: string
          created_at?: string
          created_ip?: Json | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          pin_hash: string
        }
        Update: {
          code?: string
          created_at?: string
          created_ip?: Json | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          pin_hash?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
