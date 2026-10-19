# 3. The Dashboard Tour

This chapter orients you around the admin dashboard itself — the screen you land on after signing in, and the parts of it you'll use no matter what you're actually working on. It doesn't cover any one feature in depth; that's what the rest of this manual is for.

## Signing in

Whoobe's login screen asks for your email and password. If your account (or the workspace) requires two-factor authentication, a second screen follows asking for a 6-digit authenticator code — or, if you can't access your authenticator app, a one-time recovery code instead. Password verification and MFA are two separate steps: a wrong authenticator code doesn't send you back to re-enter your password.

If you've forgotten your password, use the "Forgot password?" link on the sign-in screen.

## The layout, at a glance

Once signed in, the dashboard has four regions that stay on screen no matter what you're doing:

```
┌────────────┬──────────────────────────────────────────────┐
│            │  Top bar: page title · search · theme · user │
│  Sidebar   ├──────────────────────────────────────────────┤
│  (nav)     │  Tab strip: one tab per open item            │
│            ├──────────────────────────────────────────────┤
│            │                                              │
│            │              Main content area               │
│            │                                              │
└────────────┴──────────────────────────────────────────────┘
```

### The sidebar

The left-hand sidebar is the main navigation. Each entry corresponds to one content type or admin area: Websites, Pages, Snippets, Components, Assets, Data Objects, Documents, Outgoing Mail, Themes, Integrations, System Logs, and Settings. Clicking one opens (or switches to) its tab. See the terminology table in the manual's introduction (`docs/release/guides/user-manual/README.md`) if any of these names aren't self-explanatory yet — a few of them mean something more specific in Whoobe than the label alone suggests.

Three of these entries expand into a tree when you click the small chevron next to their icon, rather than only opening a flat list:

- **Assets** expands into your DAM folder structure, so you can jump straight into a specific folder instead of opening the Assets list and navigating there.
- **Data Objects** expands into your list of Data Classes, so you can jump straight into one class's records.
- **Settings** expands into its own sub-sections (General, DAM configuration, Data Object classes, Roles/Users/Workspaces, Security (your own two-factor authentication and, for administrators, which roles must use it, the minimum password length and single sign-on with your identity provider), Workflows, AI agent, AI image gen, Figma, Mobile App) rather than landing on a generic settings page.

Click the arrow at the top of the sidebar to collapse it to icons-only — useful on a smaller screen or when you want more room for the content area. Hovering an icon while collapsed still shows its name as a tooltip.

At the bottom of the sidebar, a small indicator shows the version of the dashboard and whether it can reach its backend ("System Online" or "System Offline", checked every 30 seconds). It isn't a full health dashboard — see the **System Logs** chapter for that — but it's the first thing worth checking if something looks broken.

### The top bar

Across the top of the main content area:

- **Page title** — the name of whatever tab is currently active.
- **Search** — a global search box. Type at least two characters to search across Data Objects, Pages, Assets, and Classes at once; results appear in a dropdown, filterable by type using the badges above the results list. Press Enter to jump straight to the first result, or click any result to open it in its own tab. Unlike the site's own public search, this one includes unpublished drafts, since it's meant for finding things to work on, not for testing what a visitor would see. A "Rebuild index" link at the bottom of the results is there for the rare case where something you know exists isn't showing up.
- **Theme toggle** — switches the dashboard itself between dark and light mode. This is purely a dashboard preference; it has no effect on how your published website looks to visitors.
- **Audit log shield** — opens the *Audit log* (only for people with the `audit:read` permission).
- **User menu** — your name and email, and a logout button.

### The tab strip

Whoobe's dashboard works like a browser or code editor: opening something (a page, an asset, a Data Class, a whole section like Snippets) opens it in its own tab, and every open tab stays live in the background — switching between them preserves whatever state you were in (scroll position, unsaved form fields, which sub-view you were on), it doesn't reload from scratch.

A few things worth knowing about tabs:

- **Right-click a tab** for a small context menu — "Close all tabs" or "Close others" — instead of clicking each tab's individual close (✕) button one at a time.
- Opening the **same item twice** (the same page, the same asset) reuses its existing tab rather than opening a duplicate.
- If you close every tab, the dashboard returns to the same splash screen shown right after signing in — just the Whoobe logo, no content. It isn't a destination you navigate to on purpose; it's simply what's there before you've opened anything.

### The main content area

This is where the active tab's content renders. What it looks like depends entirely on what kind of tab is open — a full section list (e.g. all your Snippets), or a single item's own editing view (e.g. one specific Page, opened in the visual builder). The rest of this manual's chapters walk through each of these in turn.

## What's next

With the layout out of the way, **Chapter 4, "Your First Page, Start to Finish"** walks through an actual end-to-end task — creating a website, building a page in it, and publishing it — using the navigation and tabs described here.
