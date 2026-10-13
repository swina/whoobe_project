# The story of Whoobe

## The evolution: from a Tailwind utility to a unified engine

Six years ago, Whoobe began as a modest response to a shifting frontend landscape. It was a standalone visual editor built on Vue 2 with one
clear objective: to let developers and designers build, prototype and assemble utility-first Tailwind CSS components visually. These
components could be grouped into structural kits, or exported instantly as pure, zero-dependency HTML snippets to be dropped into any web surface.

It was open, lightweight and serverless. But as the web grew more complex, the tool had to adapt. The visual logic refined during those early
experiments became the seed of something much larger. It became evident that the true bottleneck was not writing CSS or managing HTML
templates, but the way web applications are engineered from top to bottom.

That editor was published as open source: **Whoobe One Studio** ([repository](https://github.com/swina/whoobe-one-studio), [live demo](https://whoobe-one-studio.vercel.app/)).
It is still online and has 83 stars and 25 forks on GitHub, without ever having been actively promoted.

### Starting a backend platform

A structured backend was needed to supply dynamic data and to create and update it. It started with experiments on existing open-source
platforms such as FeathersJS and Directus.

Those experiments showed the limits of adopting an existing platform as the backend:

- **Integration was real development work.** Connecting the editor to an existing backend was not a matter of configuration: every
  connection had to be developed and then maintained.
- **An external application became the core.** Once the editor depended on it, a platform that was not ours sat at the centre of the product.
  Any problem in it became our problem, and any improvement we needed depended on something we did not control and could hardly change.

Owning the backend, and designing it together with the editor, was the way out of that dependency.

## The realization: more than twenty years of disconnected stacks

Whoobe is the direct byproduct of more than twenty years of hands-on experience in developing, customizing, extending and deploying almost every major
content system on the market: from the early days of ColdFusion, through the monolithic era of Joomla and WordPress, to enterprise product
platforms such as Pimcore and modern headless SaaS options such as Contentful. The pattern was always the same.

The idea was born from using practically every CMS that has existed since 2000, and from working on them for real: customising, deploying,
monitoring and operating them for real clients, some of them important ones. The limits were always the usual ones, different for each solution:

- some were **pure CMSs and nothing more**;
- others demanded **heavy, costly stacks** to run;
- others lacked **integration with external systems**;
- and then came the **advent of AI**.

These problems surfaced on every project. And at times you do not really have direct control of the core, which is the moment a limit
becomes a blocker.

### A status quo that is broken

The industry has accepted a status quo that is fragmented. Delivering a modern browser-based project, whether a simple marketing funnel
or a large data-driven application, is a sequential, high-friction process split across four silos that should not be separate.

| | Silo | What happens in it |
|---|---|---|
| 1 | **Ideation, creativity and design** | Designers work with static vector tools (Figma, Canva), sketching layouts with placeholder text detached from live data models |
| 2 | **Architecture and modelling** | Backend engineers design relational schemas, migrations and access control in isolation, disconnected from the real layouts |
| 3 | **Development and customization** | Frontend developers act as translators of pixels, writing thousands of lines of glue code to map a static design to an API payload |
| 4 | **Deploy and maintenance** | DevOps teams stitch together detached services, CDNs, third-party middleware and separate mobile repositories, which compounds technical debt |

> "Every time an endpoint changes or a design element moves, a wave of tickets crashes across multiple departments."

## The browser is an application environment, not a canvas

A content management system should not just store static strings in a database, and a visual builder should not be an isolated design
playground. Whoobe is built on the conviction that content, data modelling, external API orchestration and the visual presentation layer belong
in the same runtime context.

We refuse to accept that a team must buy or build four different systems to publish an application. Whoobe collapses these layers into a single
TypeScript monorepo on PostgreSQL 16, with the data model stored as JSONB.

## What that conviction became

The idea turned into specific choices, each with its reasons and costs written down in the [design decisions](architecture/design-decisions/README.md):

| The conviction | The choice |
|---|---|
| Content and data are one thing | A data model you change at runtime, with the same publishing, languages and API as pages ([the data model is data](architecture/design-decisions/the-data-model-is-data.md)) |
| Design and live data should meet | Elements bound to data and to external APIs in the visual editor, rendered by the same renderer as the published site ([one renderer, many outputs](architecture/design-decisions/one-renderer-many-outputs.md)) |
| Builders must not leak keys | Credentials stay on the server; the editor, the browser and apps never hold the third party's secret ([credentials stay on the server](architecture/design-decisions/credentials-stay-on-the-server.md)) |
| One platform, many surfaces | A website, a generated site, a mobile app and an API from the same content ([content](content/README.md)) |
| Sovereignty | Self-hosted, MIT, one workspace per organisation ([self-hosted and MIT](architecture/design-decisions/self-hosted-and-mit.md), [one workspace per organisation](architecture/design-decisions/one-workspace-per-organisation.md)) |
| Do not rebuild what exists | Automations plug into Activepieces or n8n; identity stays with your identity provider ([no engine of our own](architecture/design-decisions/no-automation-engine-of-our-own.md), [client access without user accounts](architecture/design-decisions/client-access-without-user-accounts.md)) |

### How the ambition changed

The first idea was smaller: a **well-made PIM/MDM and DAM**, structured data and a media library done properly. Along the way it became clear that
three things stop being optional, especially when you work with enterprise customers:

- **Integration**, because the data lives in other systems and has to meet them;
- **AI**, because it changes how content is written, translated and produced;
- **Security**, because an enterprise customer will not adopt something it cannot review, restrict and defend.

This is why the platform today is built on these pillars, and why integration, the Client Hub and a documented threat model are as central as
the data model and the media library: [Communication](communication/README.md), [AI](ai/README.md), [Security](security/README.md).

## The mission

We do not need more lightweight web builders that leak API keys, and we do not need more heavy, monolithic legacy frameworks that choke on
server infrastructure.

Whoobe exists to give engineering and product teams complete digital and infrastructure sovereignty under a permissive open-source model (MIT),
combined with the visual velocity and authoring experience expected of modern SaaS products.

> *"We are ending the era of fragmented glue-code software. We are building software the way it was always meant to be: unified, composable, performant and frictionless."*

## Where it stands today

The editor at the core of the platform is Whoobe One Studio, ported from Vue 2 to Vue 3 and embedded in a full backend.

The repository of the platform starts on 1 August 2026, a fresh start for the whole platform around the ported editor. Release 0.1.0, the first release, was prepared in October 2026 after an intense build period. It has
been installed from scratch on one reference machine and tested heavily. It is young, and the [overview](overview/whoobe-overview.md) says plainly
what it does not do yet. The platform is described in [what Whoobe is](overview/what-is-whoobe.md).

## Who is behind it

Whoobe is written and maintained by **Antonio Nardone**, IT architect and consultant. Where this story says "we", it means him and, as it
grows, the community he hopes to build around the project.

## Where it is going

The ambition is for Whoobe to be **evaluated and tested** by small organisations as well as by more structured agencies, and to grow a **community of
technical people**, from different fields, who contribute to the project: the first as **sponsors**, the others as **contributors**. The project is
open. [Why it is worth sponsoring and contributing, and how](community/why-sponsor-and-contribute.md).

## Thanks

To **everyone, without exception, with whom the author has worked over the last 25 years**. They allowed him to grow, professionally and personally,
and Whoobe is also the result of what they taught him.

To **Salvatore Sanfilippo** (antirez, the developer who created Redis), whom the author does not know personally but whose story as a developer, and
above all whose YouTube channel in recent months, have been an inspiration: AI is a tool, and it is up to us to use it to create innovative solutions.

Whoobe also stands on the shoulders of the open-source projects it is built with: see the [credits](credits.md). It takes its model of classes, objects and relations from **Pimcore**.
