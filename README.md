# usual

```
  [Rocco]  usual  v1.0.0

           Order the usual, without typing
           your details every time.
```

**usual remembers what you order, where from, and who it's for, and makes ordering it again quick.**
Your name, phone number, email and address are saved once. Each usual (like *Friday pizza* from
Sal's) prints as a receipt with the total and who owes what, and then usual helps you order it:

- **Order online**: opens the place's website, with every detail one click from being copied. Or a
  *Fill in my details* bookmark that fills checkout pages for you.
- **Call**: the number, and exactly what to say.
- **Email or copy**: the whole order, written out, ready to send or paste.

Press **I ordered it** and it's stamped into your history, so you can see what you spend each month
and where. Rocco the raccoon waits by the bins at the end of the street.

## Get it

With [pca](https://github.com/dpatel7-dev/Project-CLI-Access): open pca, pick **usual**, press **I**. Or:

```sh
curl -fsSL https://djp7.pythonanywhere.com/usual/install.sh | sh
```

Then type `usual`. To open it from Spotlight (and get reminders), run once: `usual on`.

## Using it

| To | Do this |
| --- | --- |
| Set up | The first screen walks you through it: **You** (your details and addresses), a **place**, then your **usual** |
| Make a usual | **New usual**: give it a name, pick the place, delivery or pickup, then what you get. Prices are optional |
| Order for other people | Add them in **People**, then pick who each thing is for. The receipt shows what each person owes |
| Order it | Pick the usual, then **Order online**, **Call** or **Email / Copy the order** |
| Fill in checkout pages | In **You**, drag *Fill in my details* to your bookmarks bar. Click it on a checkout page |
| Log it | **I ordered it** (type what you actually paid, if it was different) |
| Order again | **History › Order again** |
| Get a reminder | **You › Reminders**: "Friday pizza?" pops up on the days and time you pick |
| Lock it | **You › Touch ID lock** (or `usual lock on`) |
| From Terminal | `usual order pizza` prints the receipt, what to say, and the order to paste; `usual list`, `usual history` |
| Something doesn't work | `usual doctor` |

### The Touch ID lock

With the lock on, usual shows nothing until your Mac checks it's you, with Touch ID (or your Mac's
password on Macs without it). This is Apple's own check, the one that unlocks your Mac, so a photo
or a video can't fool it, and your fingerprint never leaves the Mac's security chip. usual locks
again after 15 quiet minutes, and **Lock** at the top locks it straight away. It keeps people who
borrow your Mac out of usual; your details file itself is readable by your Mac account only.

### Payment

usual never asks for card numbers. You pay the place the way you always do.

## Where things are

Everything is in `~/.usual/data.json` on your computer (readable by your account only). usual never
sends your details anywhere: you decide when to paste or send them. The window is a page served to
this computer only (127.0.0.1, behind a secret address).

## Uninstall

```sh
usual uninstall
```

## How it works

Plain Node.js (18 or newer), no dependencies. The Touch ID check is macOS's LocalAuthentication,
asked through JavaScript for Automation (nothing to install, no administrator). `npm test` runs the
tests.

MIT licence.
