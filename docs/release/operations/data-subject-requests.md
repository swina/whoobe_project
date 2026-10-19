# Data subject requests and retention

How to answer a person who asks what you hold about them, or asks you to delete it, and how to keep data no longer than you decide. For the
operator (the controller): the product finds, exports and erases; **deciding** whether a request is valid and who the person is stays with you.
What personal data exists and where: [data protection](../security/data-protection.md). The design: `docs/plans/system/data-subject-plan.md`.

Permission `data_subject:manage` (administrators only). Settings > Security > *Data subject requests*, or the API ([reference](../api/api-reference.md)).

## 1. What is found

One identifier, normally an e-mail address, matched **whole and in any case** (typing it in capitals finds it; `joann@x.org` is not `ann@x.org`).

| Where | How it matches | What a request does with it |
|---|---|---|
| **Data objects** (form submissions are drafts of the form's class) | any text value anywhere inside the object's fields, equal to the identifier; optionally only some classes | search lists them (class, key, date, which fields); export includes the values; erase deletes them (and their search entry; the usual `object.deleted` event goes out, it carries ids and names, never values) |
| **Files the visitor sent** through a form | the library files the matched object refers to **and** that came from a form upload. A picture an editor picked from the library is never deleted | listed; export lists them with their library path (download them from the library); erase deletes the file from the library **first** |
| **Mail log** | the address as a recipient (`to`, `cc`), and, unless you switch it off, as a word of its own in the subject or body (the notification a form sends to staff quotes the visitor's address) | listed; export includes the mails; erase deletes the rows |
| **Staff accounts** | the address of a user | **reported only**. Erase them in Users (deactivate or delete); their sessions go with them |

Not touched, on purpose: the **audit log** (it holds the e-mail of *staff*, never a visitor's, and the erasure itself is written to it with a fingerprint of the identifier and
the counts, never the identifier), **push subscriptions** (an endpoint is not an address; delete them as described in the data-protection page), **backups** (see section 5),
**page and snippet history** (written by staff), and logs written to disk (the login failures name a user id, the form warnings an id).

## 2. The procedure

1. **Check who is asking**, by your own process. The product cannot tell.
2. **Search.** Settings > Security > Data subject requests: type the address, *Search*. You see how many objects, files and mails, and the staff accounts that share the address. Leave *also look inside the text of mails* on unless you know the address is only ever a recipient.
3. **Export** (right of access / portability): *Download everything as JSON*. The file is named after a fingerprint (`data-subject-<12 hex>.json`), contains the records and the list of files with their library path, and is not stored anywhere. Download the files from the library and send both through your secure channel.
4. **Erase** (right to erasure): *Erase...*, tick whether the mail log is included, **type the address again** and confirm. Files are deleted first; an object whose file could not be deleted stays and the answer says why (the store was down...): run it again, it finishes the job. The screen shows what was deleted.
5. **Check**: search again, it must say 0. Answer the person within your legal deadline; the audit log (`data_subject.*`, filter by the action) is your evidence that it was done, by whom and when, without keeping the data.

By API: `POST /data-subject/search`, `/export`, and `/erase`. Erase is a **dry run unless `dryRun: false`** is sent, and a real run needs `confirm` equal to the identifier.

```
curl -b cookies.txt -H 'content-type: application/json' -d '{"identifier":"ann@example.org"}' https://your-host/data-subject/erase                 # a dry run: what would go
curl -b cookies.txt -H 'content-type: application/json' -d '{"identifier":"ann@example.org","dryRun":false,"confirm":"ann@example.org"}' https://your-host/data-subject/erase
```

A call that scans the objects is limited to 20 a minute per administrator (`DATA_SUBJECT_RATE_LIMIT_PER_MINUTE`).

## 3. Retention

Nothing is deleted by age unless you set a number; an upgrade changes nothing.

- **Per class:** the days after which an object of that class is deleted (counted from its creation), set in the same card or by `PATCH /data-classes/<id> { "retentionDays": 90 }` (administrators only, the change is audited as `data_class.retention_update`). It applies to **every object of the class, published or not**, and removes the files visitors sent with it. Use it for the classes that collect submissions; do not set it on a class that holds content you publish.
- **Mail log:** `mailLogRetentionDays` in the security settings (the same card).
- **When it runs:** a minute after core-api starts and then every day, a batch of 200 at a time, at most 100 batches per run (a big backlog is worked off over several days). *Run the retention job now* runs it at once. Each run that removed something is written to the audit log as `retention.purge` (the classes and the counts).
- A file that cannot be deleted keeps its object, is counted as failed in that run's audit row, and is tried again the next day.

Other data has its own limits: sessions (a week after they expire), the audit log (`AUDIT_RETENTION_DAYS`, default 365), staging bytes of form uploads (about 2 hours).

## 4. What a request does not cover

- **Rectification:** edit the object.
- **Restriction of processing:** unpublish the object, or erase it.
- **Another identifier** (a phone number, a name) is the same request with another value; there is no fuzzy matching, deliberately, so that a search for a common name does not erase a stranger.
- **A person known by two addresses** needs two requests.
- A person who typed their address **inside a longer text** (a "message" field) is found in mails (where the text is searched), not in objects (where only whole values are compared). Search the message fields in Objects with the filter if that matters to you.

## 5. Backups

An erasure does not reach a backup that was taken before it. Your retention for backups is the answer to "when is it gone from everywhere", and a restore brings the person back: after a restore, run the erasures again (the audit log has the list of requests, by fingerprint, and the dates; the identifiers you kept in your own request register). See [backup, restore and DR](backup-restore-and-dr.md).

## 6. Not in the product

A register of requests with deadlines and a workflow, consent records, matching by anything but the whole value, erasure from backups, the staff accounts.
