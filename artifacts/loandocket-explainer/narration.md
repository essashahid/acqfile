# LoanDocket explainer: narration

- **Final length:** 85.3 seconds, 12 spoken cues (n1–n11 and n7b). The closing card is silent. Times below are when each cue is spoken.
- **Voice:** Gemini API text-to-speech, model `gemini-3.8-flash-tts`, voice "Iapetus". Each cue was generated separately and then sped up by one uniform, pitch-preserving `atempo=1.16` for every cue, so the narration fits the existing picture. The picture was not re-rendered. Voice set: `work/audio/gemini-38-flash-tts-iapetus/` (the unadjusted takes are in `work/audio/gemini-3.8-flash-tts-iapetus/`). How it was made and checked: [README](README.md#current-voice-gemini-iapetus).
- **Heard by a person:** yes. On 2026-10-16 the user watched and approved the current 85.333-second version, including the new saved-answer line n7b and the silent closing card. (An earlier approval, 2026-09-29, covered the 88.8-second version with the spoken closing n12, no longer used.) LoanDocket, Kiel and McDermott were confirmed by ear to sound correct. No cue is awaiting a listening check.
- **Pronunciation:** the spoken text writes the product name "Loan Docket" so it is read as two words, and the Gemini direction repeats this. It also asks for "Kiel" as "Keel" and "McDermott" as "Mick-DER-mott", and says to read the amounts as written ("one million, fifty thousand dollars"; "one million"). An earlier machine transcription spelled the product name "LoanDocIt" and "Kiel" "Cale". These were transcription artifacts, superseded by the listening check. The captions use "LoanDocket" and figures such as "$1,050,000"; otherwise they match the spoken words.
- **Source of truth:** [narration.json](narration.json) holds each cue's spoken `text` and its `caption`. [captions.srt](captions.srt) is generated from it by `render.py`. Cue placement (`shot` and `at`) is in [scripts/edit.json](scripts/edit.json).

| #   | Time          | Screen                                        | Narration                                                                                                                                                                |
| --- | ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 0:00.7–0:07.2 | Opening illustration                          | Preparing an acquisition loan file means collecting documents from several people, checking the details, and chasing what's missing.                                     |
| 2   | 0:08.7–0:14.9 | Documents: upload of three files              | LoanDocket brings the documents into one file. Here, an amended purchase agreement and two personal documents arrive.                                                    |
| 3   | 0:15.9–0:19.4 | Library filtered to Kiel McDermott            | Each one is filed under the person or business it belongs to.                                                                                                            |
| 4   | 0:20.9–0:26.8 | Overview, "Next up"                           | The overview shows what still needs attention. Kiel McDermott's 2025 tax return is not on file.                                                                          |
| 5   | 0:27.9–0:37.0 | Review card, then the document opened from it | And the documents disagree on the purchase price. The amended agreement says one million, fifty thousand dollars. The letter of intent and funding plan say one million. |
| 6   | 0:37.7–0:40.9 | Agreement values beside page 1, clause 2.1    | From the review, each figure opens the page it came from.                                                                                                                |
| 7   | 0:41.9–0:48.4 | Question page, answer, Review after saving    | The reviewer records a preferred price and the reason. The discrepancy stays open until the supporting documents are corrected.                                          |
| 7b  | 0:49.7–0:52.7 | Saved answer, reopened Earlier answers        | The reviewer can reopen the saved answer and see the reason.                                                                                                             |
| 8   | 0:53.8–1:02.0 | Follow-ups: Kiel McDermott's draft            | LoanDocket drafts one message per recipient. The reviewer adds a request for corrected copies, then copies the message to send themselves.                               |
| 9   | 1:03.4–1:06.2 | Lender file: preparation status               | The lender file screen lists what is still outstanding.                                                                                                                  |
| 10  | 1:06.6–1:12.6 | Create version, download ZIP                  | Saving a version packages the renamed documents, an index, and a report, ready to download.                                                                              |
| 11  | 1:13.0–1:20.0 | Report from the downloaded ZIP                | The report lists the work still outstanding, then the preferred price, with its reason, its sources, and the corrections still needed.                                   |
| 12  | —             | Closing card                                  | Not spoken since 2026-10-16; the card shows "Scattered documents become one clear lender file. / Sources, missing items, and follow-ups stay visible." silently.         |

## Claims and what supports them

All evidence is from the recorded deal VCS-2026-015 and its lender-file version 1. The retained files are listed in the [README](README.md#retained-evidence).

| Claim                                                                                            | Verified in                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents are filed under a person or business                                                   | The Documents library's Party column and filter (9 of 45 for Kiel McDermott). Filing comes from readings prepared for this demo, as the How it works page and the README state.                                                                                                                                      |
| Missing 2025 return                                                                              | Overview "Next up"; Lender file; the report's "Unresolved preparation work" and the workbook's "Missing items": Personal federal tax return · Kiel McDermott · 2025 · Missing.                                                                                                                                       |
| $1,050,000 vs $1,000,000                                                                         | Review card; the amended agreement's value page (clause 2.1, page 1); the question page; the report and the workbook "Conflicts" sheet.                                                                                                                                                                              |
| Each figure opens its page, from the review                                                      | Recorded through normal clicks: Review → the agreement link on the card → the document page ("Opened for this item · Purchase prices agree · The sources give different values") → "Compare values with their sources" → the value page beside page 1.                                                               |
| A preferred price and a reason are recorded                                                      | "Record an answer" on the Review card opens the existing question page. 1,050,000 and "Checked both pages. The signed amendment is the latest agreement." are saved (checked in the database and on screen). Reopened with "View recorded answer", the page lists both under "Earlier answers".                      |
| The discrepancy stays open                                                                       | Review after saving: "Answer recorded: 1,050,000. The documents are unchanged; this stays open until they agree." The item stays under "Blocks the file". Workbook "Recorded answers": Disagreement status "Open", Supporting documents corrected "No"; "Conflicts" rows stay "Open".                                |
| One draft per recipient; the reviewer sends it                                                   | Follow-ups page. After the edit the draft text equalled the expected complete text, and the clipboard after "Copy draft" equalled it exactly. "Record as sent" is never pressed, and no message was sent.                                                                                                            |
| A version packages renamed documents, index, report                                              | The downloaded ZIP has `00_Package_Report.html`, `00_Package_Workbook.xlsx` and renamed originals under Buyer/, Guarantors/, Target/, Transaction/ and Z_Unfiled_or_Not_Required/ (52 paths).                                                                                                                        |
| The report shows outstanding work, then the preferred price with reason, sources and corrections | Report "Unresolved preparation work" (top); "Questions and recorded answers — for lender review" with "Answer recorded (current)", Recorded selection 1,050,000, the explanation, the supporting source (amended agreement, page 1) and "Corrections still needed" (letter of intent and funding plan, each page 1). |

## Wording left out on purpose

The narration does not say the conflict is resolved or that the file is complete or ready. The documents still disagree, and the version was created while work is outstanding. It makes no claim about faster approval, approval odds, compliance or time saved. It does not describe live AI reading: the readings were prepared for this demo, as the How it works page and the README state.

## Changes from the first version (2026-09-27)

- n6: now describes the route the video shows, from the review to the page ("From the review, each figure opens the page it came from").
- n7: "records which price the file should use, with a reason. The documents themselves are not changed" became "records a preferred price and the reason. The discrepancy stays open until the supporting documents are corrected."
- n11: "Outstanding items stay on the record, including the price question and its quoted sources" became the report line above, because the package now shows the preferred price.
- n12 and the closing card: "A file prepared for lender review" became "An organized file, with outstanding work clearly recorded", because the package shown is incomplete.
- n1, n5, n8 captions now follow the spoken words.

## Voice replacement (2026-09-29)

- The temporary macOS `say` voice "Samantha" was replaced by Gemini "Iapetus". Only the audio track changed. The video stream and the caption track (burned-in and embedded) are byte-for-byte those of the previous version, so each cue still starts where it did. `captions.srt` is unchanged.
- The Samantha version is kept locally at `work/archive/loandocket-explainer-samantha-before-iapetus.mp4`, with its captions, this file and the README as they were.
- The wording did not change. n8 was generated one sentence at a time and joined with about 0.2 s of silence, because the model repeated the whole cue when asked for it in one request.

## On-screen text revision (2026-10-02)

- No narration is drawn into the picture at any point, including the opening. The footage now fills the frame. Each of the five sections opens with one brief introduction for 3.2 s, in a dark lower band that then disappears completely (see [storyboard.md](storyboard.md)). The persistent disclosure line and the closing card's footer are gone from the picture; the How it works page and the README carry the sample-data and prepared-readings explanation. The closing card's two lines are unchanged.
- The wording, the audio and the caption track did not change. The spoken words remain available as text in the optional English caption track (`captions.srt`, the embedded track and `public/videos/loandocket-explainer.en.vtt`), which is off by default on the How it works page.
- The introductions were checked against the footage. "Missing items and conflicting values" became "A missing return, prices differ", because step 2 shows one missing document (Kiel McDermott's 2025 return) beside the purchase-price disagreement. None of the introductions says the disagreement is resolved or the file is complete.

## Reopened-answer cue (2026-10-16)

- New cue n7b, between n7 and n8: "The reviewer can reopen the saved answer and see the reason." Spoken 0:49.7–0:52.7 over the saved confirmation, the View recorded answer click and the reopened Earlier answers with the recorded reason. It shortens the silence after n7 from about 5.6 s to 1.5 s, with 1.3 s before n8.
- Evidence: the saved confirmation ("Answer recorded: 1,050,000…"), the View recorded answer click and the reopened page listing 1,050,000 and "Checked both pages. The signed amendment is the latest agreement." under Earlier answers are on screen as it is spoken. It does not say the disagreement is resolved.
- Generated once (gemini-3.8-flash-tts, Iapetus, same direction as the other cues) and sped up by the same `atempo=1.16`. No other cue was regenerated or changed.

## Silent closing (2026-10-16)

- n12 is no longer spoken and has no caption. The closing card keeps the same two lines and is shown for 4.5 s, ending the video at 85.3 s. n1–n11, their audio, wording and caption timing are unchanged. The n12 audio files remain in the voice sets as a record but are not used.

## Closing revision (2026-09-29)

- n12 and the closing card: "Organized documents. Clear follow-ups. An organized file, with outstanding work clearly recorded." became "Scattered documents become one clear lender file. Sources, missing items, and follow-ups stay visible." The card shows the two sentences as its two lines.
- Only the closing changed. n12 was generated one sentence at a time (like n8) and sped up by the same `atempo=1.16`. It starts where it did, at 81.7 s, and ends at 88.0 s. The closing card was re-rendered with `cards.mjs` (same logo, fonts, layout and disclaimer). Every frame up to the end of the crossfade into the card is unchanged, and cues n1–n11 and their captions are unchanged.
