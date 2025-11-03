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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  api: {
    Tables: {
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
      announcements: {
        Row: {
          channel_id: string
          created_at: string | null
          id: number
          message: string
          reply_to_message_id: string | null
          sent_by: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: never
          message: string
          reply_to_message_id?: string | null
          sent_by?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: never
          message?: string
          reply_to_message_id?: string | null
          sent_by?: string | null
        }
        Relationships: []
      }
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
      conversion_eligibility: {
        Row: {
          address: string
          fry_1_0_eq_of_lp_cometa: number | null
          fry_1_0_eq_of_lp_tinyman: number | null
          fry_1_0_held: number | null
          fry_1_0_staked_cometa: number | null
          fry_1_0_staked_verification: number | null
          total_fry_1_0_available: number | null
        }
        Insert: {
          address: string
          fry_1_0_eq_of_lp_cometa?: number | null
          fry_1_0_eq_of_lp_tinyman?: number | null
          fry_1_0_held?: number | null
          fry_1_0_staked_cometa?: number | null
          fry_1_0_staked_verification?: number | null
          total_fry_1_0_available?: number | null
        }
        Update: {
          address?: string
          fry_1_0_eq_of_lp_cometa?: number | null
          fry_1_0_eq_of_lp_tinyman?: number | null
          fry_1_0_held?: number | null
          fry_1_0_staked_cometa?: number | null
          fry_1_0_staked_verification?: number | null
          total_fry_1_0_available?: number | null
        }
        Relationships: []
      }
      conversion_eligibility_mirror: {
        Row: {
          _id: string
          address: string | null
          amount: number | null
          asset_id: string | null
          claimableamount: number | null
          claimablemonths: number | null
          claimedmonths: number | null
          cometalp: number | null
          cometastaking: number | null
          held: number | null
          history: Json | null
          pendingamount: number | null
          status: string | null
          tinymanlp: number | null
          verification: number | null
        }
        Insert: {
          _id: string
          address?: string | null
          amount?: number | null
          asset_id?: string | null
          claimableamount?: number | null
          claimablemonths?: number | null
          claimedmonths?: number | null
          cometalp?: number | null
          cometastaking?: number | null
          held?: number | null
          history?: Json | null
          pendingamount?: number | null
          status?: string | null
          tinymanlp?: number | null
          verification?: number | null
        }
        Update: {
          _id?: string
          address?: string | null
          amount?: number | null
          asset_id?: string | null
          claimableamount?: number | null
          claimablemonths?: number | null
          claimedmonths?: number | null
          cometalp?: number | null
          cometastaking?: number | null
          held?: number | null
          history?: Json | null
          pendingamount?: number | null
          status?: string | null
          tinymanlp?: number | null
          verification?: number | null
        }
        Relationships: []
      }
      cooldowns: {
        Row: {
          action_type: string
          created_at: string | null
          id: number
          last_action: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: number
          last_action: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: number
          last_action?: string
          user_id?: string
        }
        Relationships: []
      }
      fnode_claims: {
        Row: {
          amount_claimed: number
          amount_claimed_micro: number | null
          created_at: string
          id: string
          process_nonce: string | null
          staff_id: string
          status: string
          transaction_hash: string | null
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          amount_claimed: number
          amount_claimed_micro?: number | null
          created_at?: string
          id?: string
          process_nonce?: string | null
          staff_id: string
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          amount_claimed?: number
          amount_claimed_micro?: number | null
          created_at?: string
          id?: string
          process_nonce?: string | null
          staff_id?: string
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      fnode_distribution_log: {
        Row: {
          amount_distributed: number
          claim_id: string
          created_at: string
          error_message: string | null
          id: string
          initiator_id: string | null
          staff_id: string
          status: string
          transaction_hash: string | null
        }
        Insert: {
          amount_distributed: number
          claim_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          initiator_id?: string | null
          staff_id: string
          status: string
          transaction_hash?: string | null
        }
        Update: {
          amount_distributed?: number
          claim_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          initiator_id?: string | null
          staff_id?: string
          status?: string
          transaction_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fnode_distribution_log_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "fnode_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      fnode_rewards: {
        Row: {
          created_at: string | null
          fnode_claimed: number | null
          fnode_earned: number | null
          id: number
          last_updated_at: string | null
          staff_id: string
          staff_username: string | null
        }
        Insert: {
          created_at?: string | null
          fnode_claimed?: number | null
          fnode_earned?: number | null
          id?: never
          last_updated_at?: string | null
          staff_id: string
          staff_username?: string | null
        }
        Update: {
          created_at?: string | null
          fnode_claimed?: number | null
          fnode_earned?: number | null
          id?: never
          last_updated_at?: string | null
          staff_id?: string
          staff_username?: string | null
        }
        Relationships: []
      }
      performance_thresholds: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          last_updated_at: string | null
          threshold_name: string
          threshold_value: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_updated_at?: string | null
          threshold_name: string
          threshold_value: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_updated_at?: string | null
          threshold_name?: string
          threshold_value?: number
        }
        Relationships: []
      }
      reward_settings: {
        Row: {
          created_at: string | null
          id: number
          last_updated_at: string | null
          setting_name: string
          setting_value: number
        }
        Insert: {
          created_at?: string | null
          id?: never
          last_updated_at?: string | null
          setting_name: string
          setting_value: number
        }
        Update: {
          created_at?: string | null
          id?: never
          last_updated_at?: string | null
          setting_name?: string
          setting_value?: number
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
      staff_points: {
        Row: {
          last_updated: string
          staff_id: string
          staff_username: string | null
          total_points: number
          wallet_address: string | null
        }
        Insert: {
          last_updated?: string
          staff_id: string
          staff_username?: string | null
          total_points?: number
          wallet_address?: string | null
        }
        Update: {
          last_updated?: string
          staff_id?: string
          staff_username?: string | null
          total_points?: number
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_points_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_points_adjustments: {
        Row: {
          awarded_by: string
          awarded_by_username: string | null
          created_at: string | null
          id: number
          points_delta: number
          reason: string
          staff_id: string
          staff_username: string | null
          ticket_id: number | null
        }
        Insert: {
          awarded_by: string
          awarded_by_username?: string | null
          created_at?: string | null
          id?: number
          points_delta: number
          reason: string
          staff_id: string
          staff_username?: string | null
          ticket_id?: number | null
        }
        Update: {
          awarded_by?: string
          awarded_by_username?: string | null
          created_at?: string | null
          id?: number
          points_delta?: number
          reason?: string
          staff_id?: string
          staff_username?: string | null
          ticket_id?: number | null
        }
        Relationships: []
      }
      staff_roles: {
        Row: {
          created_at: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          created_at: string | null
          discord_message_id: string
          discord_username: string | null
          id: number
          message: string
          role: string | null
          ticket_id: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          discord_message_id: string
          discord_username?: string | null
          id?: number
          message: string
          role?: string | null
          ticket_id?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          discord_message_id?: string
          discord_username?: string | null
          id?: number
          message?: string
          role?: string | null
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
      ticket_staff: {
        Row: {
          claimed_at: string
          messages_contributed: number
          staff_id: string
          staff_username: string | null
          ticket_id: number
        }
        Insert: {
          claimed_at?: string
          messages_contributed?: number
          staff_id: string
          staff_username?: string | null
          ticket_id: number
        }
        Update: {
          claimed_at?: string
          messages_contributed?: number
          staff_id?: string
          staff_username?: string | null
          ticket_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_staff_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_staff_points: {
        Row: {
          closer_points: number | null
          created_at: string | null
          first_reply_points: number | null
          message_contribution_points: number | null
          points_awarded_for_ticket: number
          response_time_points: number | null
          staff_id: string
          staff_username: string | null
          ticket_id: number
          updated_at: string | null
        }
        Insert: {
          closer_points?: number | null
          created_at?: string | null
          first_reply_points?: number | null
          message_contribution_points?: number | null
          points_awarded_for_ticket: number
          response_time_points?: number | null
          staff_id: string
          staff_username?: string | null
          ticket_id: number
          updated_at?: string | null
        }
        Update: {
          closer_points?: number | null
          created_at?: string | null
          first_reply_points?: number | null
          message_contribution_points?: number | null
          points_awarded_for_ticket?: number
          response_time_points?: number | null
          staff_id?: string
          staff_username?: string | null
          ticket_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_staff_points_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_staff_points_ticket_id_fkey"
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
          bold_sign_signed: boolean | null
          channel_id: string | null
          claimed_by: string | null
          claimed_by_username: string | null
          closed_at: string | null
          closed_by_id: string | null
          closed_by_username: string | null
          coupon_code: string | null
          created_at: string | null
          description: string
          discord_username: string
          email: string
          factory_reset_picture_confirmed: boolean | null
          forgo_return_message_ids: Json | null
          full_name: string
          id: number
          ignore_inactivity: boolean | null
          inactivity_ping_count: number | null
          is_transcribed: boolean | null
          last_inactivity_ping_at: string | null
          last_message_at: string | null
          last_message_from_role: string | null
          last_staff_member_id: string | null
          last_staff_ping_at: string | null
          minerkeys: string | null
          order_number: string | null
          orders_quantities: string | null
          original_category_id: string | null
          original_message_id: string | null
          program_status: string | null
          registration_waived: boolean | null
          request_type: string | null
          scheduled_close_at: string | null
          selected_region: string | null
          sn_picture_confirmed: boolean | null
          staff_ping_count: number | null
          status: string | null
          ticket_type: string
          transcript_preference: string | null
          user_id: string
          validated: boolean | null
          validated_by: string | null
        }
        Insert: {
          algorand_address?: string | null
          bold_sign_signed?: boolean | null
          channel_id?: string | null
          claimed_by?: string | null
          claimed_by_username?: string | null
          closed_at?: string | null
          closed_by_id?: string | null
          closed_by_username?: string | null
          coupon_code?: string | null
          created_at?: string | null
          description?: string
          discord_username: string
          email?: string
          factory_reset_picture_confirmed?: boolean | null
          forgo_return_message_ids?: Json | null
          full_name?: string
          id?: number
          ignore_inactivity?: boolean | null
          inactivity_ping_count?: number | null
          is_transcribed?: boolean | null
          last_inactivity_ping_at?: string | null
          last_message_at?: string | null
          last_message_from_role?: string | null
          last_staff_member_id?: string | null
          last_staff_ping_at?: string | null
          minerkeys?: string | null
          order_number?: string | null
          orders_quantities?: string | null
          original_category_id?: string | null
          original_message_id?: string | null
          program_status?: string | null
          registration_waived?: boolean | null
          request_type?: string | null
          scheduled_close_at?: string | null
          selected_region?: string | null
          sn_picture_confirmed?: boolean | null
          staff_ping_count?: number | null
          status?: string | null
          ticket_type: string
          transcript_preference?: string | null
          user_id: string
          validated?: boolean | null
          validated_by?: string | null
        }
        Update: {
          algorand_address?: string | null
          bold_sign_signed?: boolean | null
          channel_id?: string | null
          claimed_by?: string | null
          claimed_by_username?: string | null
          closed_at?: string | null
          closed_by_id?: string | null
          closed_by_username?: string | null
          coupon_code?: string | null
          created_at?: string | null
          description?: string
          discord_username?: string
          email?: string
          factory_reset_picture_confirmed?: boolean | null
          forgo_return_message_ids?: Json | null
          full_name?: string
          id?: number
          ignore_inactivity?: boolean | null
          inactivity_ping_count?: number | null
          is_transcribed?: boolean | null
          last_inactivity_ping_at?: string | null
          last_message_at?: string | null
          last_message_from_role?: string | null
          last_staff_member_id?: string | null
          last_staff_ping_at?: string | null
          minerkeys?: string | null
          order_number?: string | null
          orders_quantities?: string | null
          original_category_id?: string | null
          original_message_id?: string | null
          program_status?: string | null
          registration_waived?: boolean | null
          request_type?: string | null
          scheduled_close_at?: string | null
          selected_region?: string | null
          sn_picture_confirmed?: boolean | null
          staff_ping_count?: number | null
          status?: string | null
          ticket_type?: string
          transcript_preference?: string | null
          user_id?: string
          validated?: boolean | null
          validated_by?: string | null
        }
        Relationships: []
      }
      tickets_ticketsbot: {
        Row: {
          algorand_address: string | null
          claimed_by: string | null
          claimed_by_username: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          closed_by_username: string | null
          created_at: string | null
          description: string | null
          discord_username: string | null
          email: string | null
          full_name: string | null
          id: number
          minerkeys: string | null
          order_number: string | null
          status: string | null
          ticket_type: string | null
          user_id: string | null
        }
        Insert: {
          algorand_address?: string | null
          claimed_by?: string | null
          claimed_by_username?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_username?: string | null
          created_at?: string | null
          description?: string | null
          discord_username?: string | null
          email?: string | null
          full_name?: string | null
          id: number
          minerkeys?: string | null
          order_number?: string | null
          status?: string | null
          ticket_type?: string | null
          user_id?: string | null
        }
        Update: {
          algorand_address?: string | null
          claimed_by?: string | null
          claimed_by_username?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_username?: string | null
          created_at?: string | null
          description?: string | null
          discord_username?: string | null
          email?: string | null
          full_name?: string | null
          id?: number
          minerkeys?: string | null
          order_number?: string | null
          status?: string | null
          ticket_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tickets_tickettool: {
        Row: {
          algorand_address: string | null
          claimed_by: string | null
          claimed_by_username: string | null
          closed_at: string | null
          closed_by: string | null
          closed_by_username: string | null
          created_at: string | null
          description: string | null
          discord_username: string | null
          email: string | null
          full_name: string | null
          id: number
          minerkeys: string | null
          order_number: string | null
          status: string | null
          ticket_number: string
          ticket_type: string | null
          user_id: string | null
        }
        Insert: {
          algorand_address?: string | null
          claimed_by?: string | null
          claimed_by_username?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_username?: string | null
          created_at?: string | null
          description?: string | null
          discord_username?: string | null
          email?: string | null
          full_name?: string | null
          id?: never
          minerkeys?: string | null
          order_number?: string | null
          status?: string | null
          ticket_number: string
          ticket_type?: string | null
          user_id?: string | null
        }
        Update: {
          algorand_address?: string | null
          claimed_by?: string | null
          claimed_by_username?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closed_by_username?: string | null
          created_at?: string | null
          description?: string | null
          discord_username?: string | null
          email?: string | null
          full_name?: string | null
          id?: never
          minerkeys?: string | null
          order_number?: string | null
          status?: string | null
          ticket_number?: string
          ticket_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ticketsbot_messages: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          message: string | null
          role: string | null
          ticket_id: number
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          role?: string | null
          ticket_id: number
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          role?: string | null
          ticket_id?: number
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ticket_id"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_ticketsbot"
            referencedColumns: ["id"]
          },
        ]
      }
      tickettool_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          role: string | null
          tickettool_id: number | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          role?: string | null
          tickettool_id?: number | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          role?: string | null
          tickettool_id?: number | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickettool_messages_tickettool_id_fkey"
            columns: ["tickettool_id"]
            isOneToOne: false
            referencedRelation: "tickets_tickettool"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tokens: {
        Row: {
          access_token: string
          discord_user_id: string | null
          expires_at: string
          refresh_token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          discord_user_id?: string | null
          expires_at: string
          refresh_token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          discord_user_id?: string | null
          expires_at?: string
          refresh_token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          discriminator: string | null
          id: string
          is_staff: boolean | null
          last_seen: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          discriminator?: string | null
          id: string
          is_staff?: boolean | null
          last_seen?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          discriminator?: string | null
          id?: string
          is_staff?: boolean | null
          last_seen?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_staff_points_adjustment: {
        Args: {
          p_awarded_by: string
          p_awarded_by_username: string
          p_points: number
          p_reason: string
          p_staff_id: string
          p_ticket_id?: number
        }
        Returns: number
      }
      apply_staff_points_adjustments_to_totals: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      begin_claim_processing: {
        Args: { p_claim_id: string }
        Returns: {
          amount_claimed: number
          amount_claimed_micro: number | null
          created_at: string
          id: string
          process_nonce: string | null
          staff_id: string
          status: string
          transaction_hash: string | null
          updated_at: string
          wallet_address: string | null
        }
      }
      calculate_and_distribute_fnode_rewards: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_staff_points: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_ticket_staff_points: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      close_ticket: {
        Args: {
          p_channel_id: string
          p_closed_at: string
          p_closed_by_id?: string
          p_closed_by_username?: string
          p_is_transcribed?: boolean
          p_scheduled_close_at: string
          p_status: string
        }
        Returns: undefined
      }
      complete_claim: {
        Args: { p_amount_micro: string; p_claim_id: string; p_tx_id: string }
        Returns: undefined
      }
      fail_claim: {
        Args: { p_claim_id: string; p_error: string }
        Returns: undefined
      }
      get_due_scheduled_tickets: {
        Args: Record<PropertyKey, never>
        Returns: {
          channel_id: string
          discord_username: string
          is_transcribed: boolean
          ticket_id: string
          transcript_preference: string
          user_id: string
        }[]
      }
      get_inactive_tickets: {
        Args: Record<PropertyKey, never>
        Returns: {
          algorand_address: string | null
          bold_sign_signed: boolean | null
          channel_id: string | null
          claimed_by: string | null
          claimed_by_username: string | null
          closed_at: string | null
          closed_by_id: string | null
          closed_by_username: string | null
          coupon_code: string | null
          created_at: string | null
          description: string
          discord_username: string
          email: string
          factory_reset_picture_confirmed: boolean | null
          forgo_return_message_ids: Json | null
          full_name: string
          id: number
          ignore_inactivity: boolean | null
          inactivity_ping_count: number | null
          is_transcribed: boolean | null
          last_inactivity_ping_at: string | null
          last_message_at: string | null
          last_message_from_role: string | null
          last_staff_member_id: string | null
          last_staff_ping_at: string | null
          minerkeys: string | null
          order_number: string | null
          orders_quantities: string | null
          original_category_id: string | null
          original_message_id: string | null
          program_status: string | null
          registration_waived: boolean | null
          request_type: string | null
          scheduled_close_at: string | null
          selected_region: string | null
          sn_picture_confirmed: boolean | null
          staff_ping_count: number | null
          status: string | null
          ticket_type: string
          transcript_preference: string | null
          user_id: string
          validated: boolean | null
          validated_by: string | null
        }[]
      }
      get_performance_thresholds: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string | null
          description: string | null
          id: string
          last_updated_at: string | null
          threshold_name: string
          threshold_value: number
        }[]
      }
      is_admin: {
        Args: { user_id_to_check: string }
        Returns: boolean
      }
      log_claim_pending: {
        Args: {
          p_amount_micro: string
          p_claim_id: string
          p_initiator_id: string
          p_staff_id: string
        }
        Returns: undefined
      }
      set_performance_threshold: {
        Args: {
          p_description?: string
          p_threshold_name: string
          p_threshold_value: number
        }
        Returns: undefined
      }
      trigger_calculate_fnode_rewards_edge_function: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      update_fnode_claimed: {
        Args: { p_amount: number; p_staff_id: string }
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
  public: {
    Tables: {
      [_ in never]: never
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
  api: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
