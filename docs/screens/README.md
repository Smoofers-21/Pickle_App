# Pickle screen designs

These images are the approved designs for every screen in the Pickle MVP, shown at iPhone size (390 × 844 points, rendered at 2x). Build the app to match them, together with `docs/product-spec.md` and `docs/build-plan.md`.

| Image | Screen | Who sees it | Built in |
| --- | --- | --- | --- |
| `01-home.png` | Home | Everyone | Milestone 2 |
| `02-join-code.png` | Join: enter code | Members | Milestone 2 |
| `03-join-name.png` | Join: enter name | Members | Milestone 2 |
| `04-join-errors.png` | Join: can't join (error messages) | Members | Milestone 2 (messages), polish in 9 |
| `05-lobby-host.png` | Lobby (host) | Host | Milestone 2 |
| `06-lobby-member.png` | Lobby (member) | Members | Milestone 2 |
| `07-host-setup.png` | Host setup | Host | Milestone 3 |
| `08-yes-no-picks.png` | Yes / No picks | Everyone | Milestone 3 |
| `09-waiting-for-picks.png` | Waiting for picks | Everyone | Milestone 3 |
| `10-searching.png` | Searching | Everyone | Milestone 4 |
| `11-nothing-found.png` | Nothing found | Host | Milestone 4 |
| `12-cards.png` | Option cards | Everyone | Milestone 5 |
| `13-rank-options.png` | Rank options (drag to reorder) | Everyone | Milestone 6 |
| `14-round-complete.png` | Round complete | Everyone | Milestone 6 |
| `15-final-vote.png` | Final vote | Everyone | Milestone 6 |
| `16-results.png` | Results | Everyone | Milestone 7 |
| `17-new-lobby.png` | New lobby after a game | Everyone | Milestone 7 |
| `18-host-left.png` | Host left notice | Everyone | Milestone 2 |
| `19-removed.png` | Removed from lobby | Removed member | Milestone 2 |

## How to read these designs

- Text in [square brackets], such as [Event name] or [2.1] mi, is placeholder data. Use real data from the app.
- Grey boxes labelled "Photo" are where real photos go.
- Names (Alex, Jordan, Sam), lobby codes and dates are examples.
- The design rules (colors, Outfit font, buttons, chips) are in the Design section of `docs/product-spec.md`.
- The logo on the home screen is `public/logo/pickle-logo.png`. Use the file itself; never redraw it.

## Where the spec adds to the images

When an image and the product spec differ, follow the spec. Known differences:

- **Active lobby screens:** the outlined **Leave lobby** control is consistently at the top-right, including setup, game screens and the ranking placeholder. It replaces the older host-header/member-footer exits shown in the mockups. The confirmation stays available across game stages; Cancel makes no request, failed requests while membership remains active offer a retry, and a pending leave cannot be submitted twice. Server-confirmed membership removal after submission completes the leave even if its original response was lost.
- **Picks (08):** use "No preference" (Required) and "Yes preference" (Optional) instead of the original "Guaranteed" labels. A No lowers a matching option's score rather than vetoing it; a Yes boosts it rather than guaranteeing a match. Conflicting preferences cancel out as defined in the product spec.
- **Cards (12):** show one image, not three (no story bars): an illustrative cuisine photo from `public/images/restaurants/`, labelled "Illustrative photo", or the event's Ticketmaster image. "Open now" instead of hours, no rating, and "Powered by Geoapify · © OpenStreetMap contributors" under place data (decided Nov 10–11, 2026; see the spec).
- **Cards (12) and results (16):** add the Geoapify / OpenStreetMap attribution whenever place data is shown. The images don't show it yet.
- **Round complete (14):** marked "Suggested screen" in the image; build it as shown.
- **Host left (18):** the host role passes to the member who joined earliest.
