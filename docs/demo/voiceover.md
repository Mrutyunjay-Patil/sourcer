# Narration and shot list

Final narration (2:56), transcribed with word timestamps. The video is cut so each screen starts on the first word of its sentence.

| Start | End | On screen | Narration |
| --- | --- | --- | --- |
| 0:00.0 | 0:06.2 | Animated shopfront | My mother runs a small provision shop in our hometown, and I used to spend most of my evenings after college helping her behind the counter. |
| 0:06.2 | 0:12.1 | The restock list writes itself | Every couple of days she has to restock. Because she keeps her inventory properly, writing the list takes her about 2 minutes, |
| 0:12.1 | 0:29.2 | Three phones, voice note, photo, clock | but getting the prices from suppliers is the part that eats her morning. One supplier tells her to call back after 4, another sends a voice note, and the third sends a photo of last month's list. Somehow by lunch she has the prices, but it's cost her the morning and a dozen follow -ups, and she has to do it all again in 2 days. |
| 0:29.2 | 0:37.4 | Dark screen, the list types itself, five steps | That repetition is the real problem, and it's exactly the kind of thing a bit of clever automation could take over, scraping the prices and doing the emailing for her. |
| 0:37.4 | 0:42.8 | Sourcer title card | Thus, I built Sourcer as part of Convex Allgas Hackathon, and everything you're about to see runs on real email. |
| 0:42.8 | 0:48.3 | Empty dashboard for Chai Corner Cafe | For the demo, let's take a cafe in Bengaluru called Chai Corner Cafe, with no orders and no suppliers yet. |
| 0:48.3 | 0:56.5 | Suppliers page, Find suppliers clicked, Firecrawl searching | So the first question is, who do we even ask? On the suppliers page, I type what I need, and Firecrawl goes and searches the web near the city and scrapes the pages it finds. |
| 0:56.5 | 1:06.2 | Three candidates with reasons, Accept and Reject | Then, OpenAI reads those pages, and keeps only the ones that are actually wholesalers, with a reason next to each one. Nothing gets emailed until I accept a supplier myself. |
| 1:06.2 | 1:12.6 | IndiaMART link pasted, Track clicked | A few suppliers put their price lists online, so I give Sourcer the link, and Firecrawl scrapes it now and again every week. |
| 1:12.6 | 1:19.3 | Price watch: tracked page priced, eight paneer rows | That one page gave us 8 paneer prices per kilo. And from now on, when a rate moves, the cafe sees it before ordering. |
| 1:19.3 | 1:23.0 | New request, note being typed | Now the cafe wants to place an actual order, so I type it the way I'd text it to myself. |
| 1:23.0 | 1:31.7 | Line item chips, eggs flagged and set to 5 dozen | OpenAI turns that into line items with proper quantities. And items which had no quantity, eggs in this case gets flagged, so Sourcer asks me to fill it in rather than guessing. |
| 1:31.7 | 1:39.3 | Reply-by set, Create request clicked | The cafe sets a reply by time, basically a deadline, and when that passes, the request closes and ranks whatever came in. |
| 1:39.3 | 1:45.8 | Drafted email, scrolling | Sourcer drafts the email with the cafe's items, delivery window, and deadline, and I can change any line before it gets sent. |
| 1:45.8 | 1:53.0 | Send to 2 clicked, rows flip to sent | The request goes to two suppliers in two separate threads. And each of those suppliers is a real inbox on Agent Mail. |
| 1:53.0 | 1:57.6 | Reply as Greenleaf clicked | For this demo, I'll have a supplier called Greenleaf Reply. So watch the board. |
| 1:57.6 | 2:09.1 | Quote card lands, parses, prices scroll | That email came back through Agent Mail, hit the webhook, and the quote's already on the board. OpenAI read it, paneer at 320 a kilo, oil at 138 a litre, delivery tomorrow. |
| 2:09.1 | 2:22.7 | Nandini card lands and parses | Now I'll trigger a reply from another supplier called Nandini, who writes like a real supplier, no table, just, we can do 301 and tomatoes out of stock till next week. Sourcer still pulls the prices out, and marks tomatoes as 7 days. |
| 2:22.7 | 2:29.4 | Recommendation and ranked cards | Then it ranks the two on what the whole order costs delivered, and how soon it arrives, and writes the reason out in a sentence. |
| 2:29.4 | 2:37.0 | Purchase order, supplier per line, generated | The purchase order fills in the cheapest supplier for each item, and if the cafe would rather change a supplier for an item, it's just a straight change of line. |
| 2:37.0 | 2:42.1 | Send purchase order, confirmation | Once the PO is ready, one click and the order goes back in the same email thread they quoted in. |
| 2:42.1 | 2:43.2 | Orders page | And it's on record. |
| 2:43.2 | 2:51.3 | Price watch with trend | Every quote and every order feeds the price history, so on the next order, the cafe would know instantly that paneer went up, without any of the hassle. |
| 2:51.3 | 2:55.9 | Sourcer title card | That's Sourcer, built on Convex with Firecrawl, Agent Mail, and OpenAI. Thanks for watching. |
