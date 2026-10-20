# Kit library

Status: step 1 done (origin, version, duplicate). Steps 2 and 3 not started.

## Why

The reference kits shipped until 0.2.0 were made with an editor five years old and were removed from the distribution. New kits will be made and shipped. A shipped kit must not be edited in place (the next version would overwrite the work), and the installation should later be able to receive kits from a remote catalogue.

## Model

A kit has an `origin`:

| origin | made by | editable | refreshed by |
|---|---|---|---|
| `bundled` | the distribution (`packages/core/seed-data/kits/*.json`) | no | the seed, when `version` changes |
| `catalogue` | a remote catalogue (later) | no | the catalogue, when `version` changes |
| `user` | a person, or a copy of any kit | yes | nobody |

`slug` is the stable identity of a bundled/catalogue kit (the name can change). `forkedFrom` points at the kit a copy was made from. **Duplicate** (`POST /whoobe-one/kits/:id/duplicate`) copies the templates into a new `user` kit named "<name> (copy)"; the original never changes. Adding a template to, or deleting, a bundled/catalogue kit answers 409.

A kit file can carry `slug`, `version` (a string, default `1`) and `category`; without a `slug` the file name (lower case, no `.json`) is used.

## Steps

1. Done: migration 0067 (`origin`, `version`, `slug`, `forked_from`), the seed by slug, the duplicate route, the editor's Kits panel (lock, Duplicate), Add to kit lists only user kits.
2. The dashboard's kit library page: a gallery with previews, Duplicate, and for user kits rename / templates / delete. Editing a template needs an editor session for a kit template (like snippets and mail templates).
3. The remote catalogue: a signed index of kits with `slug` and `version`; an installation lists it, installs a kit as `catalogue`, and updates the ones it has not copied. Not designed yet: who hosts it, how it is signed, whether an installation may refuse it (self-hosted, no outbound calls by default).

## Existing installations

The kits seeded before 0067 become `user` kits (they cannot be told from kits someone made); nothing is deleted.
