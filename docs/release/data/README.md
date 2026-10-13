# Data (PIM / MDM)

Whoobe is also a place to hold **structured business data**: products, events, people, locations, form submissions, any record type you define.
The model is Pimcore-style: you define a **Data Class** at runtime, create **Data Objects** of it, and use them on pages, in apps and through the API.

| Document | What it covers |
|---|---|
| [Data model](data-model.md) | Classes, fields, relations, components, languages, publishing and workflows, how data is used (pages, API, apps), import and export, limits |
| [Data and storage](../architecture/data-and-storage.md) | Where the data lives: tables, object layout, migrations, retention |
| [The data model is data](../architecture/design-decisions/the-data-model-is-data.md) | Why it works this way, and the trade-offs |
| [Draft is never public](../architecture/design-decisions/draft-is-never-public.md) | The rule that keeps drafts off the public surface |
| [Client Hub: reading data](../communication/api-clients.md) | How your own applications read published objects (`/client/v1/data`) |
| [Website export and import](../content/website-bundle.md) | Moving classes and objects with a website |
| [Data protection](../security/data-protection.md) | Personal data in objects and form submissions, erasure and portability |
| [API reference](../api/api-reference.md) | Data classes, objects, public read API |

**In the dashboard:** *Data & Communication > Data Objects* (one entry per class, a list and an editor per record); *Settings > Classes* (define classes;
import from Pimcore); *Settings > Workflows* (a workflow per class); *Data bindings* (every page and snippet that shows data).
