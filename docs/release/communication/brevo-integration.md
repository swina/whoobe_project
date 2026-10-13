# WhooBe > Brevo Integration

**From the Dashboard to Inboxes in 2 Clicks**

From `Dashboard > Snippets (or Pages)` click on the icon `Send as Brevo campaign` and push it instantly as a Brevo Email Campaign.

Map campaign names, subjects, valid senders, and targeted client lists natively from a single modal UI without ever leaving your authoring canvas.

***Fully tested, secure, and powered by the Federated API Gateway***

## What is Brevo?

> "One AI-powered customer platform for all your marketing and sales needs. From email marketing, SMS, WhatsApp, and beyond, drive business growth and lasting loyalty."

## Brevo Integration

Whoobe natively integrates with Brevo (formerly Sendinblue), enabling marketing automation and transactional communication workflows directly from the core dashboard.

Instead of relying on heavy, hardcoded plugins that introduce technical debt, this integration is driven entirely by Whoobe's Federated API Gateway via a single, declarative JSON preset file (apps/gateway/presets/brevo.json). 

This architecture unlocks unprecedented flexibility for enterprise workflows and multi-channel marketing automation.

WhooBe has a built-in configuration for Brevo API `apps/gateway/presets/brevo.json`.

### Built-in endpoints

```
/contacts                               GET     List contacts
/smtp/email                             POST    Send a transactional email
/emailCampaigns                         POST    Create an email campaign (draft)
/emailCampaigns                         GET     List email campaigns
/emailCampaigns/{campaignId}/sendNow    POST    Send a campaign immediately
/contacts/lists                         GET     List contact lists (campaign recipients)
```

## WhooBe built-in emailCampaigns

WhooBe can send with a simple click a snippet or a page directly as an email Campaign (draft) to Brevo.
The procedure is quite simple:

From `Dashboard > Snippets` click on the icon `Send as Brevo campaign`.

From the modal input :

- Campaign Name (internal Brevo name)
- Subject : subject of the email
- Sender name: name of the sender (e.g. Acme Corporation)
- Sender email: sender email (must be a valid email)
- Recipients list: select which list is the campaign target

### Important checks

Checkbox : For any image with no CDN mirror yet, embed it directly (base64) instead of linking to this install's DAM - required if the DAM isn't publicly reachable (e.g. a local/dev environment). An image already published to a CDN (Assets → "Publish to CDN") always uses its stable CDN URL regardless of this setting - no size limit, no quality loss. Uncheck only if you know the DAM itself is also public.

> Uncheck only if your DAM is public or if the email content (assets like images, etc.) are published on a CDN Mirror with a public URL

Checkbox : Auto-add an unsubscribe footer if the template doesn't already include one - Brevo rejects a campaign with no {unsubscribe} link.

> Do not uncheck because Brevo rejects a campaign with no unsubscribe link

### Send the campaign

Click on `Create draft in Brevo`. 
If an error occurs you will get an error message.





