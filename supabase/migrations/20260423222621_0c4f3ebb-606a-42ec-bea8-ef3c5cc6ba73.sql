INSERT INTO public.site_content (page, section_key, label, content)
VALUES (
  'global',
  'whatsapp_message',
  'WhatsApp Default Greeting',
  'Hello Spirit Life SOM, I''d like to make an enquiry.'
)
ON CONFLICT DO NOTHING;