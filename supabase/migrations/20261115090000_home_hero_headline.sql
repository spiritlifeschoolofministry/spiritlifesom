-- The redesigned home page leads with one headline and a scripture reference.
-- Both are editable from Admin › Settings › Site content › home, like the rest
-- of the page's wording. The home rows the new page no longer shows
-- (hero_title, hero_subtitle, hero_scripture, about_*, programme_*,
-- contact_*) are left in place: deleting an admin's text is not this
-- migration's call.

INSERT INTO public.site_content (page, section_key, label, content)
SELECT 'home', 'hero_headline', 'Home headline (the big line at the top)', 'Equipping the saints for the work of ministry.'
WHERE NOT EXISTS (SELECT 1 FROM public.site_content WHERE page = 'home' AND section_key = 'hero_headline');

INSERT INTO public.site_content (page, section_key, label, content)
SELECT 'home', 'hero_reference', 'Home scripture reference (under the headline)', 'Ephesians 4:12'
WHERE NOT EXISTS (SELECT 1 FROM public.site_content WHERE page = 'home' AND section_key = 'hero_reference');
