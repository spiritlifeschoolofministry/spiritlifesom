-- Tell the admins, over WhatsApp, when a student submits a receipt.
--
-- A submitted payment is a row sitting at status 'pending' waiting for a human
-- to look at it. Nothing currently announces it: the money is in the school's
-- account, the student believes they have paid, and the fee stays outstanding
-- until somebody happens to open the payments screen. The gap is entirely
-- invisible from both sides, which is what makes it expensive.
--
-- The trigger only names the payment. The message is composed by the function
-- from the row itself, and the recipients come from the function's own
-- configuration -- so this trigger cannot be used to send anything, to anyone.
CREATE OR REPLACE FUNCTION public.whatsapp_alert_on_payment_receipt()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- The status enum is uppercase on this table, whatever the migration that
  -- first created it says. A lowercase comparison here would match nothing and
  -- the trigger would appear to work while never firing.
  --
  -- Manual entries keyed in by staff are not news to staff, so only a genuine
  -- submission awaiting review is worth interrupting somebody for.
  IF NEW.status IS DISTINCT FROM 'PENDING' OR NEW.is_manual_record THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://siirpzuflcimkhnzvass.supabase.co/functions/v1/whatsapp-admin-alert',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'kind', 'payment_submitted',
      'payment_id', NEW.id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A student's payment must never fail because a notification did. pg_net
  -- queues rather than blocks, so this is unlikely, but the cost of being
  -- wrong is a receipt the student cannot submit at all.
  RAISE WARNING 'WhatsApp payment alert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_payment_receipt_whatsapp ON public.payments;
CREATE TRIGGER on_payment_receipt_whatsapp
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_alert_on_payment_receipt();
