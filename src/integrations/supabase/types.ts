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
      announcements: {
        Row: {
          body: string
          category: string | null
          cohort_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_published: boolean | null
          published_at: string | null
          target_audience: string | null
          target_cohort_id: string | null
          title: string
        }
        Insert: {
          body: string
          category?: string | null
          cohort_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          target_audience?: string | null
          target_cohort_id?: string | null
          title: string
        }
        Update: {
          body?: string
          category?: string | null
          cohort_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          target_audience?: string | null
          target_cohort_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_target_cohort_id_fkey"
            columns: ["target_cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          feedback: string | null
          file_url: string | null
          grade: number | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          student_id: string
          submission_text: string | null
          submitted_at: string | null
        }
        Insert: {
          assignment_id: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id: string
          submission_text?: string | null
          submitted_at?: string | null
        }
        Update: {
          assignment_id?: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          student_id?: string
          submission_text?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          cohort_id: string
          course_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          max_points: number | null
          passing_score: number | null
          title: string
        }
        Insert: {
          cohort_id: string
          course_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          max_points?: number | null
          passing_score?: number | null
          title: string
        }
        Update: {
          cohort_id?: string
          course_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          max_points?: number | null
          passing_score?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          check_in_time: string | null
          id: string
          is_verified: boolean | null
          marked_at: string | null
          marked_by: string | null
          schedule_id: string
          status: string
          student_id: string
          subject_name: string | null
        }
        Insert: {
          check_in_time?: string | null
          id?: string
          is_verified?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          schedule_id: string
          status?: string
          student_id: string
          subject_name?: string | null
        }
        Update: {
          check_in_time?: string | null
          id?: string
          is_verified?: boolean | null
          marked_at?: string | null
          marked_by?: string | null
          schedule_id?: string
          status?: string
          student_id?: string
          subject_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          start_date: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          start_date?: string
        }
        Relationships: []
      }
      course_materials: {
        Row: {
          cohort_id: string
          course_id: string
          created_at: string | null
          description: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_paid: boolean | null
          is_pinned: boolean | null
          material_type: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          cohort_id: string
          course_id: string
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_paid?: boolean | null
          is_pinned?: boolean | null
          material_type?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          cohort_id?: string
          course_id?: string
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_paid?: boolean | null
          is_pinned?: boolean | null
          material_type?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_materials_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "course_materials_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          cohort_id: string | null
          created_at: string | null
          description: string | null
          id: string
          title: string
        }
        Insert: {
          code: string
          cohort_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          title: string
        }
        Update: {
          code?: string
          cohort_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          created_at: string | null
          id: string
          payload: Json
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          payload: Json
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json
          status?: string | null
        }
        Relationships: []
      }
      fee_structures: {
        Row: {
          amount: number
          cohort_id: string | null
          created_at: string | null
          fee_name: string
          id: string
        }
        Insert: {
          amount?: number
          cohort_id?: string | null
          created_at?: string | null
          fee_name: string
          id?: string
        }
        Update: {
          amount?: number
          cohort_id?: string | null
          created_at?: string | null
          fee_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      fees: {
        Row: {
          adjusted_by: string | null
          amount_due: number | null
          amount_paid: number | null
          cohort_id: string | null
          created_at: string | null
          fee_type: string
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          recorded_by: string | null
          student_id: string
          waive_reason: string | null
          waived: boolean | null
        }
        Insert: {
          adjusted_by?: string | null
          amount_due?: number | null
          amount_paid?: number | null
          cohort_id?: string | null
          created_at?: string | null
          fee_type: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          recorded_by?: string | null
          student_id: string
          waive_reason?: string | null
          waived?: boolean | null
        }
        Update: {
          adjusted_by?: string | null
          amount_due?: number | null
          amount_paid?: number | null
          cohort_id?: string | null
          created_at?: string | null
          fee_type?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          recorded_by?: string | null
          student_id?: string
          waive_reason?: string | null
          waived?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fees_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "fees_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fees_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fees_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "fees_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          admin_notes: string | null
          amount_paid: number
          created_at: string | null
          fee_id: string | null
          id: string
          payment_date: string | null
          payment_proof_url: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount_paid?: number
          created_at?: string | null
          fee_id?: string | null
          id?: string
          payment_date?: string | null
          payment_proof_url?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount_paid?: number
          created_at?: string | null
          fee_id?: string | null
          id?: string
          payment_date?: string | null
          payment_proof_url?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          middle_name: string | null
          phone: string | null
          phone_number: string | null
          promoted_at: string | null
          promoted_by: string | null
          role: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          middle_name?: string | null
          phone?: string | null
          phone_number?: string | null
          promoted_at?: string | null
          promoted_by?: string | null
          role?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          phone?: string | null
          phone_number?: string | null
          promoted_at?: string | null
          promoted_by?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_promoted_by_fkey"
            columns: ["promoted_by"]
            isOneToOne: false
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profiles_promoted_by_fkey"
            columns: ["promoted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule: {
        Row: {
          activity_type: string | null
          course_id: string | null
          created_at: string | null
          date: string
          day: string | null
          description: string | null
          end_time: string | null
          id: string
          start_time: string | null
        }
        Insert: {
          activity_type?: string | null
          course_id?: string | null
          created_at?: string | null
          date: string
          day?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          start_time?: string | null
        }
        Update: {
          activity_type?: string | null
          course_id?: string | null
          created_at?: string | null
          date?: string
          day?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      school_events: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          start_date: string
          target_cohort_id: string | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          start_date: string
          target_cohort_id?: string | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          start_date?: string
          target_cohort_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_events_target_cohort_id_fkey"
            columns: ["target_cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          admission_status: string | null
          age: number | null
          approval_token: string | null
          approval_token_used: boolean | null
          approved_at: string | null
          bio: string | null
          cohort_id: string | null
          created_at: string | null
          date_of_birth: string | null
          educational_background: string | null
          fees_paid: number | null
          gender: string | null
          has_discovered_ministry: boolean | null
          id: string
          is_approved: boolean | null
          is_born_again: boolean | null
          learning_mode: string | null
          marital_status: string | null
          ministry_description: string | null
          preferred_language: string | null
          profile_id: string
          profile_image_url: string | null
          show_email: boolean | null
          student_code: string | null
          total_fees_due: number | null
        }
        Insert: {
          address?: string | null
          admission_status?: string | null
          age?: number | null
          approval_token?: string | null
          approval_token_used?: boolean | null
          approved_at?: string | null
          bio?: string | null
          cohort_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          educational_background?: string | null
          fees_paid?: number | null
          gender?: string | null
          has_discovered_ministry?: boolean | null
          id?: string
          is_approved?: boolean | null
          is_born_again?: boolean | null
          learning_mode?: string | null
          marital_status?: string | null
          ministry_description?: string | null
          preferred_language?: string | null
          profile_id: string
          profile_image_url?: string | null
          show_email?: boolean | null
          student_code?: string | null
          total_fees_due?: number | null
        }
        Update: {
          address?: string | null
          admission_status?: string | null
          age?: number | null
          approval_token?: string | null
          approval_token_used?: boolean | null
          approved_at?: string | null
          bio?: string | null
          cohort_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          educational_background?: string | null
          fees_paid?: number | null
          gender?: string | null
          has_discovered_ministry?: boolean | null
          id?: string
          is_approved?: boolean | null
          is_born_again?: boolean | null
          learning_mode?: string | null
          marital_status?: string | null
          ministry_description?: string | null
          preferred_language?: string | null
          profile_id?: string
          profile_image_url?: string | null
          show_email?: boolean | null
          student_code?: string | null
          total_fees_due?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "classmate_directory"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      classmate_directory: {
        Row: {
          avatar_url: string | null
          cohort_id: string | null
          cohort_name: string | null
          display_name: string | null
          first_name: string | null
          last_name: string | null
          profile_id: string | null
          role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_student_by_token: { Args: { token: string }; Returns: Json }
      approve_student_payment: {
        Args: {
          p_amount: number
          p_fee_type: string
          p_payment_id: string
          p_student_id: string
        }
        Returns: undefined
      }
      get_my_role: { Args: never; Returns: string }
      get_my_student_id: { Args: never; Returns: string }
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
