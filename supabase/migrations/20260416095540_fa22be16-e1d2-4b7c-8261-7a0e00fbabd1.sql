
-- Create site_content table for CMS
CREATE TABLE public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page text NOT NULL,
  section_key text NOT NULL,
  label text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(page, section_key)
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "site_content_public_read" ON public.site_content
  FOR SELECT USING (true);

-- Only admins can manage
CREATE POLICY "site_content_admin_manage" ON public.site_content
  FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Seed default content for Home page
INSERT INTO public.site_content (page, section_key, label, content) VALUES
  ('home', 'hero_title', 'Hero Title', 'Spirit Life School of Ministry'),
  ('home', 'hero_subtitle', 'Hero Subtitle', '"Equipping The Saints..."'),
  ('home', 'hero_scripture', 'Hero Scripture', '"...for the work of ministry, for building up the body of Christ" — Ephesians 4:12'),
  ('home', 'about_title', 'About Section Title', 'About Spirit Life SOM'),
  ('home', 'about_text', 'About Section Text', 'Spirit Life School of Ministry exists to thoroughly equip men, women and brethren who are genuinely called by God into Ministry with the accurate Word of God. Rooted in Scripture and led by the Holy Spirit, we are committed to raising men and women who are grounded in biblical truth and prepared for effective service in God''s vineyard.'),
  ('home', 'programme_title', 'Programme Section Title', 'Our Programme'),
  ('home', 'programme_text', 'Programme Section Text', 'Detailed comprehensive courses designed to ground you in biblical truth and prepare you for ministry.'),
  ('home', 'journey_title', 'Journey Section Title', 'Begin Your Ministry Journey'),
  ('home', 'step1_title', 'Step 1 Title', 'Apply'),
  ('home', 'step1_desc', 'Step 1 Description', 'Fill in the registration form online'),
  ('home', 'step2_title', 'Step 2 Title', 'Get Admitted'),
  ('home', 'step2_desc', 'Step 2 Description', 'Await your admission decision'),
  ('home', 'step3_title', 'Step 3 Title', 'Start Learning'),
  ('home', 'step3_desc', 'Step 3 Description', 'Begin your transformation'),
  ('home', 'contact_address', 'Contact Address', 'Ibadan, Nigeria'),
  ('home', 'contact_phone', 'Contact Phone', '+234 809 092 5555'),
  ('home', 'contact_email', 'Contact Email', 'spiritlifeschoolofministry@gmail.com'),
  -- About page
  ('about', 'hero_title', 'Hero Title', 'About Spirit Life School of Ministry'),
  ('about', 'hero_subtitle', 'Hero Subtitle', '"Equipping The Saints..."'),
  ('about', 'mission_title', 'Mission Title', 'Our Mission'),
  ('about', 'mission_text', 'Mission Text', 'In a time like this, women, men and brethren who are genuinely called by God into Ministry need a platform where they can be thoroughly equipped with the accurate Word of God — to help them see clearly the call of God and how to embrace it. Spirit Life School of Ministry exists to be that platform. Rooted in Scripture and led by the Holy Spirit, we are committed to raising men and women who are grounded in biblical truth and prepared for effective service in God''s vineyard.'),
  ('about', 'mission_quote', 'Mission Quote', '"Whoever wants to embrace the call of God in their life must go through thorough learning, teaching and furnishing" — Ephesians 4:12-13'),
  ('about', 'mission_quote_author', 'Quote Author', '— Prophet Cherub Obadare, Director'),
  ('about', 'why_title', 'Why Choose Us Title', 'Why Spirit Life SOM?'),
  ('about', 'story_title', 'Our Story Title', 'Our Story'),
  ('about', 'story_text', 'Our Story Text', 'Spirit Life School of Ministry was established by Spirit Life Cherubim and Seraphim Church, Ibadan, Nigeria, under the leadership of Prophet Cherub Obadare. Born out of a burden to see believers properly equipped for the work of ministry, the school was founded on the conviction that the call of God must be matched with thorough preparation. What began as a vision to train church members has grown into a full ministry training programme that has already seen its first cohort graduate and go on to serve effectively in God''s vineyard. Today, Spirit Life SOM continues to equip a new generation of believers — physically and online — for ministry life.'),
  -- Courses page
  ('courses', 'hero_title', 'Hero Title', 'Our Programme'),
  ('courses', 'hero_subtitle', 'Hero Subtitle', 'Equipping believers for ministry — 2025/26 Academic Session'),
  ('courses', 'basic_title', 'Basic Module Title', 'Basic Module'),
  ('courses', 'basic_desc', 'Basic Module Description', 'A foundational programme designed to ground you in scripture, ministry principles, and spiritual maturity. Perfect for new ministers and those seeking deeper understanding.'),
  ('courses', 'advanced_title', 'Advanced Module Title', 'Advanced Module'),
  ('courses', 'advanced_desc', 'Advanced Module Description', 'An in-depth programme for graduates of the Basic Module. Dive deeper into theology, pastoral practice, and leadership for effective ministry.'),
  ('courses', 'tuition_title', 'Tuition Title', 'Tuition & Fees'),
  ('courses', 'physical_price', 'Physical Price', 'FREE'),
  ('courses', 'online_price', 'Online Price', '₦30,000'),
  -- Faculty page
  ('faculty', 'hero_title', 'Hero Title', 'Meet Our Faculty'),
  ('faculty', 'hero_subtitle', 'Hero Subtitle', 'Dedicated servants of God committed to equipping the saints'),
  -- Contact page
  ('contact', 'hero_title', 'Hero Title', 'Get In Touch'),
  ('contact', 'hero_subtitle', 'Hero Subtitle', 'We''d love to hear from you'),
  ('contact', 'details_title', 'Details Title', 'Contact Details'),
  ('contact', 'address', 'Full Address', 'Spirit Life C&S Church, John Olorombo Street, Balogun Isale, 200258, Ibadan, Nigeria'),
  ('contact', 'phone', 'Phone Number', '+234 809 092 5555'),
  ('contact', 'email', 'Email Address', 'spiritlifeschoolofministry@gmail.com'),
  ('contact', 'form_title', 'Form Title', 'Send a Message');
