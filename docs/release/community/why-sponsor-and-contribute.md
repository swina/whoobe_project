# Why sponsor and why contribute to open-source projects

Whoobe is open (MIT). Its future depends on people and organisations that choose to use it, support it and improve it. This page explains why that is
worth doing, for whoever **uses** open source (organisations, agencies) and whoever **builds** it (developers, architects, DevOps, security people,
writers). It is general reasoning that applies to any open-source project, followed by what it means for Whoobe.

## 1. Why sponsor an open-source project

**Because you depend on it.** Software you run in production is part of your business. Open source is maintained by people whose time is finite;
if the project matters to you, funding its maintenance is risk management, the same logic as paying for a support contract on a product you cannot do without.

**Because maintenance is the hidden cost.** Writing the first version is the visible part. Answering issues, reviewing contributions, fixing security
problems, keeping dependencies current and writing documentation is continuous work. Without funding it is done on evenings and weekends, or it stops.

**Because it is cheap compared with the alternative.** A small, regular contribution is a fraction of a licence fee for a comparable commercial product,
and it keeps alive a tool whose licence will never change under you.

**Because it buys you influence, not just goodwill.** Sponsors are people the maintainer listens to. A sponsor can say what the project needs to be useful
in their situation, and that feedback shapes priorities more than silence does.

**Because it keeps the project independent.** A project funded by many small supporters does not depend on one company's decisions. That is what protects
its licence and its direction, and therefore your investment in it.

**Because it is a signal.** A sponsorship tells your team, your customers and your suppliers that this component is chosen, supported and not abandoned.

## 2. Why contribute to an open-source project

**You fix what bothers you, once, for everyone.** A bug you correct or a feature you add stays fixed after the next release, instead of being a patch you
carry forever in a private fork.

**You learn from real code.** Reading, testing and changing a production-grade project teaches more than tutorials: architecture, trade-offs, review.

**You build a visible track record.** Contributions are public evidence of skill that a CV cannot give, and they connect you with other practitioners.

**You shape the tool.** Contributors decide, by doing, what the project becomes. The people who show up set the direction.

**You are not limited to code.** Documentation, translations, testing, security review, design, support to other users and writing examples are real
contributions, often the most needed.

**It is good for your organisation too.** A company that lets its people contribute gets a tool that fits it better, engineers who grow, and a lower
risk of being stranded by a fork it cannot maintain.

## 3. What it means for Whoobe

Whoobe is built and maintained today by one person ([the story](../whoobe-history.md)). The aim is to be evaluated and tested by small organisations
and by structured agencies, and to grow a community of technical people from different fields: **sponsors** who help keep it maintained, and
**contributors** who help improve it.

### 3.1 Ways to help, concrete ones

The documentation says plainly what has not been tested. Each of these is a real gap that a contributor can close:

| Area | What is needed |
|---|---|
| **Identity providers** | Try the Client Hub with Entra ID, Cognito and Auth0 (only Keycloak has been run) and report or fix what differs: [API clients, section 10](../communication/api-clients.md) |
| **Operations** | Rehearse the runbooks that were written but never run: restore on a new host, upgrade, workspace removal and re-creation ([operations](../operations/README.md)); run a load test; test a live TLS hostname |
| **Security** | Independent review of the threat model and findings; the dynamic scan and manual checklist on a release commit; first external audit ([security](../security/README.md)) |
| **Integrations** | Presets for more vendors, mail-provider descriptions (a JSON file each), more automation engines tried ([Integrations](../communication/integrations.md), [outgoing mail](../communication/mail-providers.md)) |
| **Data** | Import from CSV, JSON and XLSX (a placeholder today); tests on larger catalogues ([data model](../data/data-model.md)) |
| **Documentation** | Reviews by someone other than the author, the unwritten chapters of the user manual, translations (English only today) |
| **Field testing** | Run a pilot, report what was hard: [overview, chapter 10](../overview/whoobe-overview.md) |
| **Code** | Issues and pull requests on the repository; how, in the [contributing guide](https://github.com/swina/whoobe_project/blob/master/CONTRIBUTING.md) (every change is logged in `CHANGES.md`, tested, and documented) |

### 3.2 Ways to sponsor

The repository has GitHub Sponsors enabled for the author (`.github/FUNDING.yml`): use the **Sponsor** button on the repository. Organisations that want
something other than a monthly contribution (a support arrangement, a funded feature, a partnership) should talk to the author directly; terms are
agreed case by case, not published here.

### 3.3 What a sponsorship does not do

- It does not buy a service-level agreement or a certification: Whoobe has no vendor support organisation today (the [overview](../overview/whoobe-overview.md) says so).
- It does not change the licence: the code stays MIT.
- It does not pay for a feature unless that is agreed explicitly.

## 4. A short checklist

**Before you sponsor:** is this component in production, or will it be? Would an abandoned version hurt you? Is the licence the one you need?

**Before you contribute:** read the [contributing guide](https://github.com/swina/whoobe_project/blob/master/CONTRIBUTING.md) and the [code of conduct](https://github.com/swina/whoobe_project/blob/master/CODE_OF_CONDUCT.md); report security problems as described in [SECURITY.md](https://github.com/swina/whoobe_project/blob/master/SECURITY.md). Then read [what Whoobe is](../overview/what-is-whoobe.md) and the [design decisions](../architecture/design-decisions/README.md)
(they explain why things are the way they are, and what the trade-offs were), then pick one thing from the table above.
