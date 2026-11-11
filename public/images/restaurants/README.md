# Cuisine images

Local, illustrative photos for restaurant and bar cards (see "Cuisine images"
in `docs/build-plan.md`). Phones load them from Pickle itself; no image is
ever requested from a places API.

## Adding or replacing a photo

1. Download a photo from [Unsplash](https://unsplash.com) or
   [Pexels](https://www.pexels.com) (both licenses allow free use in apps; no
   payment or permission needed). Pick a landscape photo that clearly shows the
   food or the kind of bar, with no people's faces in focus and no visible
   restaurant names or logos.
2. Save it in `assets/restaurant-originals/` with the file name from the table
   below (any of .jpg, .jpeg, .png, .webp).
3. Run `npm run images`. It crops each original to 3:2, resizes it to
   1200 × 800 and saves a compressed `.jpg` here.
4. Add a row to `CREDITS.md`: file, Unsplash or Pexels, the photographer's
   name, the license name and the photo's page link.

Originals in `assets/restaurant-originals/` are not committed (they're large);
only the processed files here are.

## The photo list

**Needed first** (everything else falls back to these):

| File | Shows |
|---|---|
| `restaurant-default.jpg` | A restaurant table or a shared meal, no specific cuisine |
| `bar-default.jpg` | A bar counter with drinks |
| `italian.jpg` | Pasta |
| `pizza.jpg` | Pizza |
| `mexican.jpg` | Tacos |
| `chinese.jpg` | Dumplings or noodles |
| `japanese.jpg` | Ramen or a Japanese set meal |
| `sushi.jpg` | Sushi |
| `indian.jpg` | Curry with naan |
| `american.jpg` | A diner-style meal |
| `burger.jpg` | A burger |
| `pub.jpg` | Pints in a pub |

**Nice to have** (until added, these use the fallback in brackets):

| File | Shows | Falls back to |
|---|---|---|
| `thai.jpg` | Pad thai or curry | `restaurant-default` |
| `korean.jpg` | Korean barbecue or bibimbap | `restaurant-default` |
| `vietnamese.jpg` | Pho | `restaurant-default` |
| `mediterranean.jpg` | Mezze, hummus, falafel | `restaurant-default` |
| `greek.jpg` | Greek salad or gyros | `mediterranean` |
| `middle-eastern.jpg` | Shawarma or kebab | `mediterranean` |
| `seafood.jpg` | Seafood platter | `restaurant-default` |
| `steakhouse.jpg` | Steak | `restaurant-default` |
| `bbq.jpg` | Barbecue ribs or brisket | `restaurant-default` |
| `vegetarian.jpg` | A colourful vegetable bowl | `restaurant-default` |
| `breakfast.jpg` | Eggs and pancakes | `restaurant-default` |
| `brunch.jpg` | Brunch spread | `breakfast` |
| `cafe.jpg` | Coffee and pastries | `restaurant-default` |
| `fine-dining.jpg` | A plated dish, elegant table | `restaurant-default` |
| `cocktail-bar.jpg` | Cocktails | `bar-default` |
| `wine-bar.jpg` | Wine glasses | `bar-default` |
| `brewery.jpg` | Beer taps or a beer garden | `pub` |
| `nightclub.jpg` | Dance floor lights | `bar-default` |
| `sports-bar.jpg` | Screens showing a game, beers | `bar-default` |
| `karaoke.jpg` | Microphone on a stage | `bar-default` |
| `live-music.jpg` | A small stage with a band | `bar-default` |
| `rooftop.jpg` | A rooftop bar at dusk | `bar-default` |
