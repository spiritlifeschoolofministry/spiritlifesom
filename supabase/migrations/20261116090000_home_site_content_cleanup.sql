-- Site content for the home page, matched to the page that ships now.
--
-- 1. Remove the home rows no page reads any more. The redesigned home page
--    links to About, Courses and Contact instead of repeating them, so its old
--    hero, about, programme and contact text did nothing when edited (the
--    Contact page has its own address / phone / email rows, and Barnabas reads
--    those, not these).
-- 2. Add a row for every piece of home page wording that was still fixed in
--    code, so an admin can edit all of it from Admin › Settings › Site content
--    › home. Rows that take a list hold one item per line.

DELETE FROM public.site_content
WHERE page = 'home'
  AND section_key IN (
    'hero_title', 'hero_subtitle', 'hero_scripture',
    'about_title', 'about_text',
    'programme_title', 'programme_text',
    'contact_address', 'contact_phone', 'contact_email'
  );

INSERT INTO public.site_content (page, section_key, label, content)
SELECT v.page, v.section_key, v.label, v.content
FROM (VALUES
  ('home', 'hero_welcome', 'Home: small line above the headline', 'Welcome to Spirit Life School of Ministry'),
  ('home', 'intake_button', 'Home: main button while admissions are closed (opens WhatsApp)', 'Ask about the next intake'),
  ('home', 'intake_message', 'Home: WhatsApp message that button starts', 'Hello Spirit Life SOM, I''d like to know when the next intake opens.'),
  ('home', 'study_title', 'Home: "How you can study" heading', 'How you can study'),
  ('home', 'physical_points', 'Home: Physical, what is included (one per line)', E'Saturdays, 9AM to 12PM, in Ibadan\nIn-person lectures and practicals\nCourse handouts are sold separately'),
  ('home', 'online_points', 'Home: Online, what is included (one per line)', E'Live Zoom sessions every Saturday\nTraining materials and class recordings included\nAttend in person for project defence and graduation'),
  ('home', 'footer_text', 'Home: footer line', '© 2026 Spirit Life Cherubim & Seraphim Church. All rights reserved.')
) AS v(page, section_key, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM public.site_content s WHERE s.page = v.page AND s.section_key = v.section_key
);

-- Clearer labels for the rows the home page already used.
UPDATE public.site_content SET label = 'Home: headline' WHERE page = 'home' AND section_key = 'hero_headline';
UPDATE public.site_content SET label = 'Home: scripture reference under the headline' WHERE page = 'home' AND section_key = 'hero_reference';
UPDATE public.site_content SET label = 'Home: joining steps heading' WHERE page = 'home' AND section_key = 'journey_title';
