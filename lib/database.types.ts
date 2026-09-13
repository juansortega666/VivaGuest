export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      access_code_reads: {
        Row: {
          cleaning_id: string | null
          id: number
          ip: unknown
          property_id: string
          read_at: string
          read_by: string
          user_agent: string | null
        }
        Insert: {
          cleaning_id?: string | null
          id?: number
          ip?: unknown
          property_id: string
          read_at?: string
          read_by: string
          user_agent?: string | null
        }
        Update: {
          cleaning_id?: string | null
          id?: number
          ip?: unknown
          property_id?: string
          read_at?: string
          read_by?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_code_reads_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_reads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_reads_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      calendar_feeds: {
        Row: {
          claimed_at: string | null
          consecutive_failures: number
          dead_alert_sent_at: string | null
          id: string
          is_active: boolean
          is_authoritative: boolean
          last_attempt_at: string | null
          last_error: string | null
          last_etag: string | null
          last_event_count: number | null
          last_http_status: number | null
          last_min_ends_on: string | null
          last_payload_hash: string | null
          last_success_at: string | null
          next_sync_at: string
          property_id: string
          provider: Database["public"]["Enums"]["feed_provider"]
        }
        Insert: {
          claimed_at?: string | null
          consecutive_failures?: number
          dead_alert_sent_at?: string | null
          id?: string
          is_active?: boolean
          is_authoritative?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_etag?: string | null
          last_event_count?: number | null
          last_http_status?: number | null
          last_min_ends_on?: string | null
          last_payload_hash?: string | null
          last_success_at?: string | null
          next_sync_at?: string
          property_id: string
          provider: Database["public"]["Enums"]["feed_provider"]
        }
        Update: {
          claimed_at?: string | null
          consecutive_failures?: number
          dead_alert_sent_at?: string | null
          id?: string
          is_active?: boolean
          is_authoritative?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_etag?: string | null
          last_event_count?: number | null
          last_http_status?: number | null
          last_min_ends_on?: string | null
          last_payload_hash?: string | null
          last_success_at?: string | null
          next_sync_at?: string
          property_id?: string
          provider?: Database["public"]["Enums"]["feed_provider"]
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_reservations: {
        Row: {
          disappeared_at: string | null
          ends_on: string
          ends_on_anterior: string | null
          feed_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          payload_hash: string
          property_id: string
          raw_description: string | null
          reservation_code: string | null
          starts_on: string
          summary: string | null
          uid: string
        }
        Insert: {
          disappeared_at?: string | null
          ends_on: string
          ends_on_anterior?: string | null
          feed_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          payload_hash: string
          property_id: string
          raw_description?: string | null
          reservation_code?: string | null
          starts_on: string
          summary?: string | null
          uid: string
        }
        Update: {
          disappeared_at?: string | null
          ends_on?: string
          ends_on_anterior?: string | null
          feed_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          payload_hash?: string
          property_id?: string
          raw_description?: string | null
          reservation_code?: string | null
          starts_on?: string
          summary?: string | null
          uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_reservations_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "calendar_feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_tasks: {
        Row: {
          descripcion: string
          id: string
          is_active: boolean
          requiere_foto: boolean
          room_type_id: string
          slot: number
        }
        Insert: {
          descripcion: string
          id?: string
          is_active?: boolean
          requiere_foto?: boolean
          room_type_id: string
          slot: number
        }
        Update: {
          descripcion?: string
          id?: string
          is_active?: boolean
          requiere_foto?: boolean
          room_type_id?: string
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_tasks_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_payout_lines: {
        Row: {
          cleaning_id: string | null
          concepto: string | null
          evidencia_bucket: string | null
          evidencia_path: string | null
          expense_id: string | null
          fecha_ejecucion: string
          fecha_programada: string
          id: string
          moneda: string
          monto: number
          orden: number
          payout_id: string
          property_id: string | null
          property_nombre: string
          tipo: string
        }
        Insert: {
          cleaning_id?: string | null
          concepto?: string | null
          evidencia_bucket?: string | null
          evidencia_path?: string | null
          expense_id?: string | null
          fecha_ejecucion: string
          fecha_programada: string
          id?: string
          moneda?: string
          monto: number
          orden?: number
          payout_id: string
          property_id?: string | null
          property_nombre: string
          tipo: string
        }
        Update: {
          cleaning_id?: string | null
          concepto?: string | null
          evidencia_bucket?: string | null
          evidencia_path?: string | null
          expense_id?: string | null
          fecha_ejecucion?: string
          fecha_programada?: string
          id?: string
          moneda?: string
          monto?: number
          orden?: number
          payout_id?: string
          property_id?: string | null
          property_nombre?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_payout_lines_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "cleaner_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_payouts: {
        Row: {
          aseador_id: string | null
          aseador_nombre: string
          cantidad_aseos: number
          cantidad_gastos: number
          id: string
          moneda: string
          monto_aseos: number
          monto_gastos: number
          monto_total: number
          pagado_at: string | null
          pagado_por: string | null
          periodo_desde: string
          periodo_hasta: string
        }
        Insert: {
          aseador_id?: string | null
          aseador_nombre: string
          cantidad_aseos?: number
          cantidad_gastos?: number
          id?: string
          moneda?: string
          monto_aseos?: number
          monto_gastos?: number
          monto_total?: number
          pagado_at?: string | null
          pagado_por?: string | null
          periodo_desde: string
          periodo_hasta: string
        }
        Update: {
          aseador_id?: string | null
          aseador_nombre?: string
          cantidad_aseos?: number
          cantidad_gastos?: number
          id?: string
          moneda?: string
          monto_aseos?: number
          monto_gastos?: number
          monto_total?: number
          pagado_at?: string | null
          pagado_por?: string | null
          periodo_desde?: string
          periodo_hasta?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_payouts_aseador_id_fkey"
            columns: ["aseador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_payouts_pagado_por_fkey"
            columns: ["pagado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_payouts_periodo_desde_fkey"
            columns: ["periodo_desde"]
            isOneToOne: false
            referencedRelation: "payout_periods"
            referencedColumns: ["periodo_desde"]
          },
        ]
      }
      cleaning_checklist_items: {
        Row: {
          checklist_task_id: string
          cleaning_id: string
          done_at: string | null
          done_by: string | null
          id: string
          nota: string | null
          property_room_id: string
          requiere_foto: boolean
          room_label: string
          sort_order: number
          task_label: string
        }
        Insert: {
          checklist_task_id: string
          cleaning_id: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          nota?: string | null
          property_room_id: string
          requiere_foto: boolean
          room_label: string
          sort_order?: number
          task_label: string
        }
        Update: {
          checklist_task_id?: string
          cleaning_id?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          nota?: string | null
          property_room_id?: string
          requiere_foto?: boolean
          room_label?: string
          sort_order?: number
          task_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_checklist_items_checklist_task_id_fkey"
            columns: ["checklist_task_id"]
            isOneToOne: false
            referencedRelation: "checklist_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklist_items_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklist_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_checklist_items_property_room_id_fkey"
            columns: ["property_room_id"]
            isOneToOne: false
            referencedRelation: "property_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_photos: {
        Row: {
          bytes: number
          captured_lat: number | null
          captured_lng: number | null
          checklist_item_id: string | null
          cleaning_id: string
          created_at: string
          damage_id: string | null
          deleted_at: string | null
          expense_id: string | null
          height: number | null
          id: string
          kind: string
          mime_type: string
          missing_report_id: string | null
          storage_bucket: string
          storage_path: string
          taken_at: string | null
          uploaded_by: string
          width: number | null
        }
        Insert: {
          bytes: number
          captured_lat?: number | null
          captured_lng?: number | null
          checklist_item_id?: string | null
          cleaning_id: string
          created_at?: string
          damage_id?: string | null
          deleted_at?: string | null
          expense_id?: string | null
          height?: number | null
          id?: string
          kind: string
          mime_type: string
          missing_report_id?: string | null
          storage_bucket?: string
          storage_path: string
          taken_at?: string | null
          uploaded_by: string
          width?: number | null
        }
        Update: {
          bytes?: number
          captured_lat?: number | null
          captured_lng?: number | null
          checklist_item_id?: string | null
          cleaning_id?: string
          created_at?: string
          damage_id?: string | null
          deleted_at?: string | null
          expense_id?: string | null
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string
          missing_report_id?: string | null
          storage_bucket?: string
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_photos_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "cleaning_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_photos_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_photos_damage_id_fkey"
            columns: ["damage_id"]
            isOneToOne: false
            referencedRelation: "damages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_photos_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_photos_missing_report_id_fkey"
            columns: ["missing_report_id"]
            isOneToOne: false
            referencedRelation: "missing_item_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_room_skips: {
        Row: {
          cleaning_id: string
          created_at: string
          id: string
          motivo: Database["public"]["Enums"]["motivo_sin_evidencia"]
          nota: string | null
          property_room_id: string
          room_label: string
          skipped_by: string
        }
        Insert: {
          cleaning_id: string
          created_at?: string
          id?: string
          motivo: Database["public"]["Enums"]["motivo_sin_evidencia"]
          nota?: string | null
          property_room_id: string
          room_label: string
          skipped_by: string
        }
        Update: {
          cleaning_id?: string
          created_at?: string
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_sin_evidencia"]
          nota?: string | null
          property_room_id?: string
          room_label?: string
          skipped_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_room_skips_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_room_skips_property_room_id_fkey"
            columns: ["property_room_id"]
            isOneToOne: false
            referencedRelation: "property_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_room_skips_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_state_transitions: {
        Row: {
          actor_id: string | null
          cleaning_id: string
          created_at: string
          from_state: Database["public"]["Enums"]["cleaning_state"] | null
          id: number
          reason: string | null
          to_state: Database["public"]["Enums"]["cleaning_state"] | null
        }
        Insert: {
          actor_id?: string | null
          cleaning_id: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["cleaning_state"] | null
          id?: number
          reason?: string | null
          to_state?: Database["public"]["Enums"]["cleaning_state"] | null
        }
        Update: {
          actor_id?: string | null
          cleaning_id?: string
          created_at?: string
          from_state?: Database["public"]["Enums"]["cleaning_state"] | null
          id?: number
          reason?: string | null
          to_state?: Database["public"]["Enums"]["cleaning_state"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_state_transitions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_state_transitions_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
        ]
      }
      cleanings: {
        Row: {
          aseador_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          confirmado_at: string | null
          confirmado_by: string | null
          created_at: string
          deleted_at: string | null
          finished_at: string | null
          hora_limite: string
          id: string
          instrucciones: string | null
          is_managed: boolean
          is_urgent: boolean
          legal_hold: boolean
          legal_hold_reason: string | null
          needs_review: boolean
          num_huespedes: number | null
          origin: string
          pago_aseador: number | null
          property_id: string
          reservation_id: string | null
          review_reason: string | null
          scheduled_date: string
          started_at: string | null
          state: Database["public"]["Enums"]["cleaning_state"] | null
          tarifa_huesped: number | null
          tipo: Database["public"]["Enums"]["cleaning_type"]
          updated_at: string
        }
        Insert: {
          aseador_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          confirmado_at?: string | null
          confirmado_by?: string | null
          created_at?: string
          deleted_at?: string | null
          finished_at?: string | null
          hora_limite: string
          id?: string
          instrucciones?: string | null
          is_managed: boolean
          is_urgent?: boolean
          legal_hold?: boolean
          legal_hold_reason?: string | null
          needs_review?: boolean
          num_huespedes?: number | null
          origin: string
          pago_aseador?: number | null
          property_id: string
          reservation_id?: string | null
          review_reason?: string | null
          scheduled_date: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["cleaning_state"] | null
          tarifa_huesped?: number | null
          tipo?: Database["public"]["Enums"]["cleaning_type"]
          updated_at?: string
        }
        Update: {
          aseador_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          confirmado_at?: string | null
          confirmado_by?: string | null
          created_at?: string
          deleted_at?: string | null
          finished_at?: string | null
          hora_limite?: string
          id?: string
          instrucciones?: string | null
          is_managed?: boolean
          is_urgent?: boolean
          legal_hold?: boolean
          legal_hold_reason?: string | null
          needs_review?: boolean
          num_huespedes?: number | null
          origin?: string
          pago_aseador?: number | null
          property_id?: string
          reservation_id?: string | null
          review_reason?: string | null
          scheduled_date?: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["cleaning_state"] | null
          tarifa_huesped?: number | null
          tipo?: Database["public"]["Enums"]["cleaning_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleanings_aseador_id_fkey"
            columns: ["aseador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleanings_confirmado_by_fkey"
            columns: ["confirmado_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleanings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleanings_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "calendar_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      damages: {
        Row: {
          cleaning_id: string
          created_at: string
          descripcion: string
          id: string
          nota_admin: string | null
          property_id: string
          reported_by: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          cleaning_id: string
          created_at?: string
          descripcion: string
          id?: string
          nota_admin?: string | null
          property_id: string
          reported_by: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          cleaning_id?: string
          created_at?: string
          descripcion?: string
          id?: string
          nota_admin?: string | null
          property_id?: string
          reported_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damages_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damages_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damages_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          cleaning_id: string
          concepto: string
          created_at: string
          id: string
          moneda: string
          monto: number
          property_id: string
          reported_by: string
        }
        Insert: {
          cleaning_id: string
          concepto: string
          created_at?: string
          id?: string
          moneda?: string
          monto: number
          property_id: string
          reported_by: string
        }
        Update: {
          cleaning_id?: string
          concepto?: string
          created_at?: string
          id?: string
          moneda?: string
          monto?: number
          property_id?: string
          reported_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_sync_runs: {
        Row: {
          block_count: number | null
          cleanings_cancelled: number
          cleanings_created: number
          event_count: number | null
          feed_id: string
          finished_at: string | null
          http_status: number | null
          id: number
          max_ends_on: string | null
          min_ends_on: string | null
          outcome: string
          reservation_count: number | null
          reviews_flagged: number
          started_at: string
          uid_rotations: number
          unknown_count: number | null
        }
        Insert: {
          block_count?: number | null
          cleanings_cancelled?: number
          cleanings_created?: number
          event_count?: number | null
          feed_id: string
          finished_at?: string | null
          http_status?: number | null
          id?: number
          max_ends_on?: string | null
          min_ends_on?: string | null
          outcome: string
          reservation_count?: number | null
          reviews_flagged?: number
          started_at?: string
          uid_rotations?: number
          unknown_count?: number | null
        }
        Update: {
          block_count?: number | null
          cleanings_cancelled?: number
          cleanings_created?: number
          event_count?: number | null
          feed_id?: string
          finished_at?: string | null
          http_status?: number | null
          id?: number
          max_ends_on?: string | null
          min_ends_on?: string | null
          outcome?: string
          reservation_count?: number | null
          reviews_flagged?: number
          started_at?: string
          uid_rotations?: number
          unknown_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_sync_runs_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "calendar_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      missing_item_catalog: {
        Row: {
          id: string
          is_active: boolean
          nombre: string
          property_id: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          nombre: string
          property_id?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          nombre?: string
          property_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "missing_item_catalog_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      missing_item_lines: {
        Row: {
          cantidad: number
          catalog_item_id: string | null
          id: string
          nombre_libre: string | null
          nombre_snapshot: string
          report_id: string
        }
        Insert: {
          cantidad?: number
          catalog_item_id?: string | null
          id?: string
          nombre_libre?: string | null
          nombre_snapshot: string
          report_id: string
        }
        Update: {
          cantidad?: number
          catalog_item_id?: string | null
          id?: string
          nombre_libre?: string | null
          nombre_snapshot?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missing_item_lines_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "missing_item_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missing_item_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "missing_item_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      missing_item_reports: {
        Row: {
          cleaning_id: string
          created_at: string
          id: string
          property_id: string
          reported_by: string
        }
        Insert: {
          cleaning_id: string
          created_at?: string
          id?: string
          property_id: string
          reported_by: string
        }
        Update: {
          cleaning_id?: string
          created_at?: string
          id?: string
          property_id?: string
          reported_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "missing_item_reports_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missing_item_reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missing_item_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          cleaning_id: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          next_attempt_at: string
          payload: Json
          property_id: string | null
          push_attempts: number
          push_last_error: string | null
          push_status: Database["public"]["Enums"]["push_status"]
          read_at: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          url: string | null
        }
        Insert: {
          body: string
          cleaning_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          next_attempt_at?: string
          payload?: Json
          property_id?: string | null
          push_attempts?: number
          push_last_error?: string | null
          push_status?: Database["public"]["Enums"]["push_status"]
          read_at?: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          url?: string | null
        }
        Update: {
          body?: string
          cleaning_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          next_attempt_at?: string
          payload?: Json
          property_id?: string | null
          push_attempts?: number
          push_last_error?: string | null
          push_status?: Database["public"]["Enums"]["push_status"]
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_cleaning_id_fkey"
            columns: ["cleaning_id"]
            isOneToOne: false
            referencedRelation: "cleanings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_periods: {
        Row: {
          aseos_no_computados: number
          cerrado_at: string
          cerrado_por: string | null
          moneda: string
          periodo_desde: string
          periodo_hasta: string
        }
        Insert: {
          aseos_no_computados?: number
          cerrado_at?: string
          cerrado_por?: string | null
          moneda?: string
          periodo_desde: string
          periodo_hasta: string
        }
        Update: {
          aseos_no_computados?: number
          cerrado_at?: string
          cerrado_por?: string | null
          moneda?: string
          periodo_desde?: string
          periodo_hasta?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_periods_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deactivated_at: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          cluster: string
          contacto_externo: string | null
          created_at: string
          direccion: string | null
          fee_discriminado: boolean
          gestion_vivaguest: boolean
          hora_limite: string
          id: string
          is_active: boolean
          maps_lat: number | null
          maps_lng: number | null
          maps_url: string | null
          nombre: string
          pago_aseador: number | null
          responsable_id: string | null
          suplente_id: string | null
          tarifa_huesped: number | null
          updated_at: string
        }
        Insert: {
          cluster: string
          contacto_externo?: string | null
          created_at?: string
          direccion?: string | null
          fee_discriminado?: boolean
          gestion_vivaguest?: boolean
          hora_limite?: string
          id?: string
          is_active?: boolean
          maps_lat?: number | null
          maps_lng?: number | null
          maps_url?: string | null
          nombre: string
          pago_aseador?: number | null
          responsable_id?: string | null
          suplente_id?: string | null
          tarifa_huesped?: number | null
          updated_at?: string
        }
        Update: {
          cluster?: string
          contacto_externo?: string | null
          created_at?: string
          direccion?: string | null
          fee_discriminado?: boolean
          gestion_vivaguest?: boolean
          hora_limite?: string
          id?: string
          is_active?: boolean
          maps_lat?: number | null
          maps_lng?: number | null
          maps_url?: string | null
          nombre?: string
          pago_aseador?: number | null
          responsable_id?: string | null
          suplente_id?: string | null
          tarifa_huesped?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_suplente_id_fkey"
            columns: ["suplente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_rooms: {
        Row: {
          etiqueta: string
          id: string
          is_active: boolean
          property_id: string
          room_type_id: string
          sort_order: number
        }
        Insert: {
          etiqueta: string
          id?: string
          is_active?: boolean
          property_id: string
          room_type_id: string
          sort_order?: number
        }
        Update: {
          etiqueta?: string
          id?: string
          is_active?: boolean
          property_id?: string
          room_type_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      property_secrets: {
        Row: {
          codigo_acceso: string | null
          ical_url: string | null
          notas_acceso: string | null
          property_id: string
          tipo_cerradura: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          codigo_acceso?: string | null
          ical_url?: string | null
          notas_acceso?: string | null
          property_id: string
          tipo_cerradura?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          codigo_acceso?: string | null
          ical_url?: string | null
          notas_acceso?: string | null
          property_id?: string
          tipo_cerradura?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_secrets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_secrets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          p256dh: string
          revoked_at: string | null
          revoked_reason: string | null
          soporta_declarativo: boolean
          user_agent: string | null
          user_id: string
          verificacion_enviada_at: string | null
          verificacion_grado:
            | Database["public"]["Enums"]["grado_verificacion_aviso"]
            | null
          verificacion_intentos: number
          verificacion_token: string | null
          verificado_at: string | null
          visto_at: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh: string
          revoked_at?: string | null
          revoked_reason?: string | null
          soporta_declarativo?: boolean
          user_agent?: string | null
          user_id: string
          verificacion_enviada_at?: string | null
          verificacion_grado?:
            | Database["public"]["Enums"]["grado_verificacion_aviso"]
            | null
          verificacion_intentos?: number
          verificacion_token?: string | null
          verificado_at?: string | null
          visto_at?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          soporta_declarativo?: boolean
          user_agent?: string | null
          user_id?: string
          verificacion_enviada_at?: string | null
          verificacion_grado?:
            | Database["public"]["Enums"]["grado_verificacion_aviso"]
            | null
          verificacion_intentos?: number
          verificacion_token?: string | null
          verificado_at?: string | null
          visto_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          id: string
          nombre: string
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          nombre: string
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          nombre?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      storage_deletion_queue: {
        Row: {
          attempts: number
          bucket: string
          deleted_at: string | null
          enqueued_at: string
          id: number
          last_error: string | null
          path: string
        }
        Insert: {
          attempts?: number
          bucket: string
          deleted_at?: string | null
          enqueued_at?: string
          id?: number
          last_error?: string | null
          path: string
        }
        Update: {
          attempts?: number
          bucket?: string
          deleted_at?: string | null
          enqueued_at?: string
          id?: number
          last_error?: string | null
          path?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aseo_sin_evidencia_completa: {
        Args: { p_cleaning: string }
        Returns: boolean
      }
      aseos_sin_evidencia_completa: {
        Args: { p_cleanings: string[] }
        Returns: string[]
      }
      cancel_cleaning: { Args: { p_cleaning: string }; Returns: undefined }
      cerrar_periodo: {
        Args: { p_desde: string; p_hasta: string }
        Returns: number
      }
      cerrar_periodo_si_toca: { Args: never; Returns: number }
      clear_review_flag: { Args: { p_cleaning: string }; Returns: undefined }
      close_cleaning: { Args: { p_cleaning: string }; Returns: undefined }
      confirm_cleaning: {
        Args: {
          p_cleaning: string
          p_instrucciones: string
          p_num_huespedes: number
        }
        Returns: undefined
      }
      confirmar_prueba_a_mano: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      confirmar_prueba_por_toque: {
        Args: { p_token: string }
        Returns: undefined
      }
      create_manual_cleaning: {
        Args: {
          p_fecha: string
          p_property: string
          p_tipo: Database["public"]["Enums"]["cleaning_type"]
        }
        Returns: string
      }
      decline_cleaning: {
        Args: { p_cleaning: string; p_motivo: string }
        Returns: undefined
      }
      dia_bog: { Args: { p_instante: string }; Returns: string }
      dispatch_feed_syncs: { Args: never; Returns: number }
      dispatch_push_notifications: { Args: never; Returns: number }
      estado_avisos_aseadores: {
        Args: never
        Returns: {
          aseador_id: string
          primera_suscripcion_at: string
          suscripciones_vivas: number
          ultima_verificacion: string
          ultimo_exito: string
          ultimo_visto: string
          verificado_por_toque: boolean
        }[]
      }
      feed_health_watchdog: { Args: never; Returns: undefined }
      finish_cleaning: { Args: { p_cleaning: string }; Returns: undefined }
      foto_vencida: {
        Args: { p_created_at: string; p_kind: string }
        Returns: boolean
      }
      periodo_de_cierre: {
        Args: { p_dia: string }
        Returns: {
          periodo_desde: string
          periodo_hasta: string
        }[]
      }
      periodo_pendiente_de_cierre: {
        Args: never
        Returns: {
          periodo_desde: string
          periodo_hasta: string
        }[]
      }
      reassign_cleaning: {
        Args: { p_aseador: string; p_cleaning: string }
        Returns: undefined
      }
      registrar_prueba_de_aviso: {
        Args: { p_endpoint: string }
        Returns: string
      }
      registrar_suscripcion_push: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_soporta_declarativo: boolean
          p_user_agent: string
        }
        Returns: undefined
      }
      report_damage: {
        Args: { p_cleaning: string; p_descripcion: string }
        Returns: string
      }
      report_expense: {
        Args: {
          p_cleaning: string
          p_concepto: string
          p_moneda?: string
          p_monto: number
        }
        Returns: string
      }
      report_missing_items: {
        Args: { p_cleaning: string; p_items: string[] }
        Returns: string
      }
      reschedule_cleaning: {
        Args: { p_cleaning: string; p_fecha: string }
        Returns: undefined
      }
      reveal_access_code: {
        Args: { p_cleaning: string }
        Returns: {
          codigo_acceso: string
          notas_acceso: string
          tipo_cerradura: string
        }[]
      }
      skip_room_evidence: {
        Args: {
          p_cleaning: string
          p_motivo: Database["public"]["Enums"]["motivo_sin_evidencia"]
          p_nota?: string
          p_room: string
        }
        Returns: undefined
      }
      start_cleaning: { Args: { p_cleaning: string }; Returns: undefined }
      sync_feed_apply: {
        Args: {
          p_etag: string
          p_events: Json
          p_feed_id: string
          p_fetched_at: string
          p_http_status?: number
          p_payload_hash: string
        }
        Returns: Json
      }
      tarifas_de_apartamentos: {
        Args: { p_ids?: string[] }
        Returns: {
          pago_aseador: number
          property_id: string
          tarifa_huesped: number
        }[]
      }
      today_bog: { Args: never; Returns: string }
      toggle_checklist_item: {
        Args: { p_done: boolean; p_item: string; p_nota?: string }
        Returns: undefined
      }
      ultimo_dia_habil_del_mes: { Args: { p_dia: string }; Returns: string }
      unskip_room_evidence: {
        Args: { p_cleaning: string; p_room: string }
        Returns: undefined
      }
    }
    Enums: {
      cleaning_state: "pendiente" | "en_curso" | "completada" | "cancelada"
      cleaning_type: "normal" | "repaso" | "emergencia"
      feed_provider: "airbnb" | "booking" | "otro"
      grado_verificacion_aviso: "toque" | "manual"
      motivo_sin_evidencia:
        | "huesped_dejo_cosas"
        | "cuarto_cerrado"
        | "sin_luz"
        | "otro"
      notification_type:
        | "asignacion"
        | "no_puedo"
        | "dano_reportado"
        | "faltantes_reportados"
        | "gasto_reportado"
        | "aseo_completado"
        | "hora_limite_vencida"
        | "calendario_caido"
        | "extension_sospechosa"
        | "aseo_cancelado"
        | "retencion_proxima"
      push_status: "pendiente" | "enviado" | "fallido" | "descartado"
      user_role: "admin" | "aseador"
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
    Enums: {
      cleaning_state: ["pendiente", "en_curso", "completada", "cancelada"],
      cleaning_type: ["normal", "repaso", "emergencia"],
      feed_provider: ["airbnb", "booking", "otro"],
      grado_verificacion_aviso: ["toque", "manual"],
      motivo_sin_evidencia: [
        "huesped_dejo_cosas",
        "cuarto_cerrado",
        "sin_luz",
        "otro",
      ],
      notification_type: [
        "asignacion",
        "no_puedo",
        "dano_reportado",
        "faltantes_reportados",
        "gasto_reportado",
        "aseo_completado",
        "hora_limite_vencida",
        "calendario_caido",
        "extension_sospechosa",
        "aseo_cancelado",
        "retencion_proxima",
      ],
      push_status: ["pendiente", "enviado", "fallido", "descartado"],
      user_role: ["admin", "aseador"],
    },
  },
} as const

