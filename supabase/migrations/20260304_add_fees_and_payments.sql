-- Create fee_structures table
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  UNIQUE(cohort_id, name)
);

-- Create payments table for tracking payment submissions
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_id uuid REFERENCES public.fees(id) ON DELETE CASCADE,
  fee_type text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  receipt_url text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  notes text,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamp with time zone,
  rejected_reason text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT valid_verification CHECK (
    (status = 'pending' AND verified_by IS NULL AND verified_at IS NULL) OR
    (status = 'verified' AND verified_by IS NOT NULL AND verified_at IS NOT NULL) OR
    (status = 'rejected' AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fee_structures_cohort ON public.fee_structures(cohort_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_active ON public.fee_structures(is_active);
CREATE INDEX IF NOT EXISTS idx_payments_student ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments(created_at DESC);

-- Grant access to authenticated users
GRANT SELECT, INSERT ON public.fee_structures TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;

-- Enable RLS
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fee_structures
-- Students can view fee_structures for their cohort
CREATE POLICY "Students can view fee_structures for their cohort"
  ON public.fee_structures FOR SELECT
  USING (
    cohort_id IN (
      SELECT cohort_id FROM public.students WHERE profile_id = auth.uid()
    )
  );

-- Admins can view all fee_structures
CREATE POLICY "Admins can view all fee_structures"
  ON public.fee_structures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can insert fee_structures
CREATE POLICY "Admins can insert fee_structures"
  ON public.fee_structures FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update fee_structures
CREATE POLICY "Admins can update fee_structures"
  ON public.fee_structures FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for payments
-- Students can insert their own payments
CREATE POLICY "Students can insert their own payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    student_id = (
      SELECT id FROM public.students WHERE profile_id = auth.uid()
    )
  );

-- Students can view their own payments
CREATE POLICY "Students can view their own payments"
  ON public.payments FOR SELECT
  USING (
    student_id = (
      SELECT id FROM public.students WHERE profile_id = auth.uid()
    )
  );

-- Admins can view all payments
CREATE POLICY "Admins can view all payments"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update payments (for verification)
CREATE POLICY "Admins can update payments"
  ON public.payments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
