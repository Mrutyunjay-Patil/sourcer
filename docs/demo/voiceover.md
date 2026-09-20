# Narration transcript with timestamps

Transcribed from your recording (2:51). These are the actual times in the audio, and the video is cut so each screen change lands on the line that describes it.

| Start | End | On screen | You say |
| --- | --- | --- | --- |
| 0:01.2 | 0:07.4 | Animated shopfront, shutter rolls up | My family runs a small provision shop back home. I grew up behind that counter. |
| 0:07.4 | 0:15.2 | Weekly list writes itself | Every Thursday, the same list gets written on the back of a bill. Rice, oil, sugar, tea. That part takes two minutes. |
| 0:15.2 | 0:28.8 | Three phones, voice note, photo of price list, clock | Getting the prices takes the whole morning. One supplier says call me after four. One sends a voice note. One sends a photo of last month's list. Nothing lines up. Nobody knows who's actually cheapest. |
| 0:28.8 | 0:42.0 | Dark screen: list types itself, five steps | So I built the thing I wished we had. You type the list. Sorcer finds suppliers, emails them, reads every reply, ranks the quotes, sends the order. All by email. All live. |
| 0:42.0 | 0:49.4 | Sourcer title card with the four logos | This is Sorcer, built on Convex for the all -gas hackathon. Everything you're about to see is real. |
| 0:49.4 | 0:55.7 | Sign-in done, empty dashboard | This is the demo kitchen. Chai Corner Cafe. First problem? Who do we even ask? |
| 0:55.7 | 1:02.6 | Suppliers page, items typed, Find suppliers clicked, Firecrawl searching | I type what I need, and Firecrawl searches the web near Bengaluru, scrapes the candidate pages. |
| 1:02.6 | 1:10.9 | Three candidates with reasons, Accept / Reject | OpenAI keeps only real wholesalers, tells me why. Nothing's emailed until I accept a supplier, so I stay in control. |
| 1:10.9 | 1:20.8 | Price page tracked, Price watch shows it crawled and priced | Firecrawl also watches supplier price pages every week. That Indiamark page gave us eight paneer prices, so the shop sees when a rate moves. |
| 1:20.8 | 1:26.2 | New request, note typed | Now the order. I type it the way I would text it to myself. No forms. |
| 1:26.2 | 1:33.3 | Line item chips, eggs flagged and set to 5 dozen | OpenAI turns it into line items. Eggs had no quantity, so it asks instead of guessing. Five dozen. |
| 1:33.3 | 1:39.3 | Reply-by time and nudge set, request created | I set when suppliers must reply by. The request closes, ranks itself at that time. |
| 1:39.3 | 1:47.7 | AI-drafted email, scrolled | The quote request is drafted in my voice, with the items, the delivery window, the reply by date. I can edit any of it before it goes out. |
| 1:47.7 | 1:53.3 | Send to 2 clicked, rows flip to sent | Two suppliers, two separate agent mail threads. Each one is a real inbox. |
| 1:53.3 | 2:02.8 | Reply as Greenleaf clicked | Greenleaf's inbox is now replying to that email. This is not a mock. The reply goes through agent mail and hits a signed webhook on Convex. |
| 2:02.8 | 2:14.1 | Quote card lands and parses; prices, fee, lead time, confidence | It lands on the board with no refresh. OpenAI reads the reply. Three unit prices, a delivery fee, a one -day lead time, 99 % confidence. |
| 2:14.1 | 2:24.9 | Reply as Nandini clicked; second card lands and parses | Nandini replies the waste the pliers actually write. Messy, pros, one item out of stock till next week. It still parses, and that becomes a seven -day lead time. |
| 2:24.9 | 2:31.3 | Recommendation banner and ranked cards | Convex re -ranks every quote on landed cost, coverage, and lead time. Writes the reason in plain language. |
| 2:31.3 | 2:37.2 | Purchase order table, supplier per line, PO generated | The purchase order is pre -filled with the best supplier per item. I can override any line. |
| 2:37.2 | 2:41.0 | Send purchase order clicked; sent confirmation | One click, and the order goes back in the same email thread. |
| 2:41.0 | 2:45.8 | Orders page | Every order is on record. Every quote feeds the price watch. |
| 2:45.8 | 2:50.3 | Price watch, then back to requests | Sorcer. Built on Convex with Firecrawl, Agent Mail, and OpenAI. |
| 2:50.3 | 2:51.3 | Requests list, hold | Thanks for watching. |

## Audio processing applied

- High-pass at 80 Hz and low-pass at 12 kHz to remove rumble and hiss
- Spectral noise reduction (afftdn), de-esser
- Compression 3:1 with make-up gain, gentle EQ (minus 2 dB at 180 Hz, plus 2 dB at 3 kHz for presence)
- Loudness normalised to -16 LUFS, true peak -1.5 dB (YouTube spec)

The cleaned track is `narration-clean.m4a`; the raw recording is untouched.
