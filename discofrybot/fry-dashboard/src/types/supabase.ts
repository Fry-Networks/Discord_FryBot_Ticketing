export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  api: {
    Tables: {
      bot_logs: {
        Row: {
          id: string
          level: string
          message: string
          scope: string | null
          timestamp: string | null
        }
        Insert: {
          id?: string
          level: string
          message: string
          scope?: string | null
          timestamp?: string | null
        }
        Update: {
          id?: string
          level?: string
          message?: string
          scope?: string | null
          timestamp?: string | null
        }
        Relationships: []
      }
      staff_actions: {
        Row: {
          action: string
          id: string
          staff_id: string
          ticket_id: number
          timestamp: string | null
        }
        Insert: {
          action: string
          id?: string
          staff_id: string
          ticket_id: number
          timestamp?: string | null
        }
        Update: {
          action?: string
          id?: string
          staff_id?: string
          ticket_id?: number
          timestamp?: string | null
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          created_at: string | null
          discord_message_id: string
          id: number
          message: string
          ticket_id: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          discord_message_id: string
          id?: number
          message: string
          ticket_id?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          discord_message_id?: string
          id?: number
          message?: string
          ticket_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          enabled: boolean | null
          icon: string | null
          id: string
          label: string | null
        }
        Insert: {
          enabled?: boolean | null
          icon?: string | null
          id: string
          label?: string | null
        }
        Update: {
          enabled?: boolean | null
          icon?: string | null
          id?: string
          label?: string | null
        }
        Relationships: []
      }
      tickets: {
        Row: {
          algorand_address: string | null
          channel_id: string | null
          claimed_by: string | null
          closed_at: string | null
          created_at: string | null
          description: string
          discord_username: string
          email: string
          full_name: string
          id: number
          minerkeys: string | null
          order_number: string | null
          orders_quantities: Json | null
          program_status: string | null
          request_type: string | null
          registration_waived: boolean | null
          selected_region: string | null
          sn_picture_confirmed: boolean | null
          factory_reset_picture_confirmed: boolean | null
          status: string | null
          ticket_type: string
          user_id: string
          validated: boolean | null
          validated_by: string | null
          bold_sign_signed: boolean | null
          coupon_code: string | null
          claimed_by_username: string | null
          closed_by: string | null
          closed_by_username: string | null
          closed_by_id: string | null
          close_reason: string | null
          is_transcribed: boolean | null
          original_category_id: string | null
          original_message_id: string | null
          scheduled_close_at: string | null
          transcript_preference: string | null
        }
        Insert: {
          algorand_address?: string | null
          channel_id?: string | null
          claimed_by?: string | null
          closed_at?: string | null
          created_at?: string | null
          description: string
          discord_username: string
          email: string
          full_name: string
          id?: number
          minerkeys?: string | null
          order_number?: string | null
          orders_quantities?: Json | null
          program_status?: string | null
          request_type?: string | null
          registration_waived?: boolean | null
          selected_region?: string | null
          sn_picture_confirmed?: boolean | null
          factory_reset_picture_confirmed?: boolean | null
          status?: string | null
          ticket_type: string
          user_id: string
          validated?: boolean | null
          validated_by?: string | null
          bold_sign_signed?: boolean | null
          coupon_code?: string | null
          claimed_by_username?: string | null
          closed_by?: string | null
          closed_by_username?: string | null
          closed_by_id?: string | null
          close_reason?: string | null
          is_transcribed?: boolean | null
          original_category_id?: string | null
          original_message_id?: string | null
          scheduled_close_at?: string | null
          transcript_preference?: string | null
        }
        Update: {
          algorand_address?: string | null
          channel_id?: string | null
          claimed_by?: string | null
          closed_at?: string | null
          created_at?: string | null
          description?: string
          discord_username?: string
          email?: string
          full_name?: string
          id?: number
          minerkeys?: string | null
          order_number?: string | null
          orders_quantities?: Json | null
          program_status?: string | null
          request_type?: string | null
          registration_waived?: boolean | null
          selected_region?: string | null
          sn_picture_confirmed?: boolean | null
          factory_reset_picture_confirmed?: boolean | null
          status?: string | null
          ticket_type?: string
          user_id?: string
          validated?: boolean | null
          validated_by?: string | null
          bold_sign_signed?: boolean | null
          coupon_code?: string | null
          claimed_by_username?: string | null
          closed_by?: string | null
          closed_by_username?: string | null
          closed_by_id?: string | null
          close_reason?: string | null
          is_transcribed?: boolean | null
          original_category_id?: string | null
          original_message_id?: string | null
          scheduled_close_at?: string | null
          transcript_preference?: string | null
        }
        Relationships: []
      }
      user_tokens: {
        Row: {
          access_token: string
          expires_at: string
          refresh_token: string
          updated_at: string | null
          user_id: string
          discord_user_id: string | null
        }
        Insert: {
          access_token: string
          expires_at: string
          refresh_token: string
          updated_at?: string | null
          user_id: string
          discord_user_id?: string | null
        }
        Update: {
          access_token?: string
          expires_at?: string
          refresh_token?: string
          updated_at?: string | null
          user_id?: string
          discord_user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          discriminator: string | null
          id: string
          last_seen: string | null
          username: string | null
          is_staff: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          discriminator?: string | null
          id: string
          last_seen?: string | null
          username?: string | null
          is_staff?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          discriminator?: string | null
          id?: string
          last_seen?: string | null
          username?: string | null
          is_staff?: boolean | null
        }
        Relationships: []
      }
      staff_points: {
        Row: {
          staff_id: string
          total_points: number
          staff_username: string | null
          last_updated: string | null
        }
        Insert: {
          staff_id: string
          total_points: number
          staff_username?: string | null
          last_updated?: string | null
        }
        Update: {
          staff_id?: string
          total_points?: number
          staff_username?: string | null
          last_updated?: string | null
        }
        Relationships: []
      }
      ticket_staff_points: {
        Row: {
          ticket_id: number
          staff_id: string
          staff_username: string | null
          points_awarded_for_ticket: number
          created_at: string | null
          updated_at: string | null
          first_reply_points: number | null
          response_time_points: number | null
          closer_points: number | null
          message_contribution_points: number | null
        }
        Insert: {
          ticket_id: number
          staff_id: string
          staff_username?: string | null
          points_awarded_for_ticket: number
          created_at?: string | null
          updated_at?: string | null
          first_reply_points?: number | null
          response_time_points?: number | null
          closer_points?: number | null
          message_contribution_points?: number | null
        }
        Update: {
          ticket_id?: number
          staff_id?: string
          staff_username?: string | null
          points_awarded_for_ticket?: number
          created_at?: string | null
          updated_at?: string | null
          first_reply_points?: number | null
          response_time_points?: number | null
          closer_points?: number | null
          message_contribution_points?: number | null
        }
        Relationships: []
      }      
      fnode_rewards: {
        Row: {
          id: number
          staff_id: string
          staff_username: string | null
          fnode_earned: number
          fnode_claimed: number
          last_updated_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          staff_id: string
          staff_username?: string | null
          fnode_earned?: number
          fnode_claimed?: number
          last_updated_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          staff_id?: string
          staff_username?: string | null
          fnode_earned?: number
          fnode_claimed?: number
          last_updated_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_staff_id"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      reward_settings: {
        Row: {
          id: number
          setting_name: string
          setting_value: number
          last_updated_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          setting_name: string
          setting_value: number
          last_updated_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          setting_name?: string
          setting_value?: number
          last_updated_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }      
      performance_thresholds: {
        Row: {
          id: string
          threshold_name: string
          threshold_value: number
          description: string | null
          last_updated_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          threshold_name: string
          threshold_value: number
          description?: string | null
          last_updated_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          threshold_name?: string
          threshold_value?: number
          description?: string | null
          last_updated_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      purge_old_logs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_and_distribute_fnode_rewards: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      set_performance_threshold: {
        Args: {
          p_threshold_name: string
          p_threshold_value: number
          p_description?: string | null
        }
        Returns: void
      }
      get_performance_thresholds: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          threshold_name: string
          threshold_value: number
          description: string | null
          last_updated_at: string | null
          created_at: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      purge_old_logs: {
        Args: Record<PropertyKey, never>
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
