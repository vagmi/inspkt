# inspkt — Product Requirements Document

**Product name:** inspkt
**Document type:** Product Requirements Document (product-level)
**Status:** Draft v1 — Phase 1 scope
**Last updated:** June 12, 2026

---

## 1. Summary

inspkt is an inspection platform that lets organizations define their own inspection forms, register the things they inspect, and capture inspections in the field with location awareness. Each completed inspection is automatically scored and resolved into a clear verdict — pass, conditional pass, or fail — along with the corrective actions and re-inspection schedule that the result demands.

The product replaces the common reality of inspections living in paper checklists, spreadsheets, and photo libraries with a single structured flow: define the rubric once, inspect against it consistently, and get a defensible verdict and report every time.

Phase 1 delivers the full human-driven workflow. A later phase introduces AI assistance that can read field photos and notes and propose inspection results for review, but that is explicitly out of scope for this document except where it shapes near-term design intent.

---

## 2. Problem statement

Inspections are everywhere — HVAC units, vehicles, rental properties, food-service sites, equipment, construction punch-lists — and they almost all suffer from the same problems:

- **Inconsistent judgment.** Two inspectors filling the same checklist reach different conclusions because the pass/fail rules live in their heads, not in the form.
- **Lost context.** Photos and notes end up disconnected from the checklist item they relate to, and there's rarely a record of *where* the inspection happened.
- **No reliable verdict.** A list of ticked boxes isn't a decision. Someone still has to manually decide whether the result is acceptable, what needs fixing, and when a re-check is due.
- **Weak follow-through.** Failed items and required re-inspections fall through the cracks because nothing tracks them to closure.

inspkt addresses these by making the rubric explicit and reusable, tying every observation to a location and an item, and turning a completed inspection into an automatic, rules-based verdict with built-in follow-up.

---

## 3. Goals and success metrics

### Product goals
1. Let any user define a custom inspection form without help.
2. Make field capture fast, structured, and location-aware.
3. Produce a consistent, explainable verdict from every inspection — not just a record of answers.
4. Ensure failed inspections and required re-inspections are tracked to closure.

### Success metrics (Phase 1)
- A new user can create a usable inspection form and complete their first inspection in a single session, unaided.
- Every submitted inspection yields a verdict with no manual scoring step.
- Conditional and failed inspections automatically generate correction items and/or a re-inspection date.
- The dashboard surfaces every overdue re-inspection without the user searching for it.

---

## 4. Target users

| User | Description | Primary needs |
|---|---|---|
| **Form author / admin** | Defines inspection types and rules for the organization. Often a supervisor, compliance lead, or operations manager. | Build and maintain forms, set what passes and what fails, manage the list of inspectable items. |
| **Inspector** | Performs inspections in the field, frequently on mobile, sometimes offline-adjacent (poor signal). | Fast capture, clear checklist, attach photos and notes, tag location, submit and move on. |
| **Reviewer / manager** | Oversees results, follows up on failures, monitors compliance posture. | See verdicts at a glance, track open corrections and re-inspections, pull a report. |

For a workshop or early build, a single user may play all three roles; the product should not *require* role separation in Phase 1.

---

## 5. Scope

### In scope (Phase 1)
- Custom inspection form creation
- Inspectable item registry with geo-tagging
- Field inspection capture with per-observation photos, notes, and location
- Automatic verdict engine (scoring + pass/conditional/fail logic)
- Corrective actions and re-inspection scheduling
- Inspection report view
- Inspection lifecycle tracking and a status dashboard

### Out of scope (Phase 1)
- AI-assisted inspection (photo/note interpretation, auto-drafted results) — *Phase 2*
- Predictive maintenance / scheduling forecasts
- Multi-organization / multi-tenant separation
- Fully offline field operation
- Native mobile apps (responsive web is sufficient)
- Customer-facing portals or external sharing

---

## 6. Features

### 6.1 Inspection form builder

The form is the reusable rubric. Authors create different **types** of inspection forms (e.g. "Quarterly HVAC Check," "Vehicle Pre-Trip," "Unit Move-Out") and define the checkpoints within each.

A form is an ordered set of **checkpoints**, optionally organized into **sections**. Each checkpoint specifies how it is answered and how it counts toward the verdict:

- **Answer type** — one of:
  - *Pass/fail* — a simple boolean judgment.
  - *Numeric reading* — a measured value (e.g. pressure, temperature) judged against acceptable / warning / failing ranges.
  - *Rating* — a graded scale (e.g. 1–5, or good / fair / poor).
  - *Observation* — a note and/or photo with no automatic judgment (for context capture).
- **Critical flag** — if set, a failure on this checkpoint forces the entire inspection to fail, regardless of the overall score.
- **Severity weight** — minor / major / critical, controlling how much a failure influences the score.
- **Photo requirement** — whether a photo must be attached for the checkpoint to be considered complete.

Authors can save forms, edit them, and reuse them across many inspections. Each form effectively encodes the organization's standard for that inspection type, so judgment becomes consistent across inspectors.

### 6.2 Inspection items (the inspectable registry)

Users create and maintain the **items** that inspections are performed against — the physical thing being inspected (an HVAC unit, a vehicle, a property unit, a piece of equipment, a site).

Each item carries:
- A name / identifier
- A type or category
- A **location (geo-tag)** — the item's known or registered position
- Its inspection history and most recent verdict at a glance

The registry exists so inspections always attach to a known subject, results accumulate against that subject over time, and the location of what's being inspected is captured by default. Items can be created ad hoc during an inspection if one doesn't already exist.

### 6.3 Inspection capture

An inspector starts an inspection by choosing a form and the item being inspected. The capture experience then walks the checkpoints in order. For each checkpoint the inspector can:

- Enter the answer (pass/fail, reading, rating, or observation)
- Add a free-text note
- Attach one or more photos
- The inspection records **location (geo-tag)** at the point of capture — both the overall inspection location and, where relevant, per-observation location

Capture supports **save as draft** (resume later) and **submit** (finalize and trigger the verdict). The flow is designed to be quick and mobile-friendly, since most inspections happen on a phone or tablet in the field.

#### Geo-tagging behavior
Location is a first-class part of inspection data, not an afterthought:
- Each inspection captures where it was performed.
- Captured location can be compared against the item's registered location to surface a mismatch (e.g. an inspection logged far from where the asset should be).
- Locations feed a future map-based view of inspections and items.

### 6.4 Verdict engine

This is the core of the product and what makes inspkt more than a digital checklist. When an inspection is submitted, the engine evaluates it in two layers and produces a decision automatically.

**Per-checkpoint evaluation.** Each answer resolves to *pass*, *warn*, or *fail*:
- Pass/fail answers map directly.
- Numeric readings resolve by which range they land in (acceptable / warning / failing).
- Ratings resolve against the configured threshold.
- Observations carry context but don't produce a pass/fail on their own.

**Aggregate verdict.** The engine then produces an overall result using:
- **Critical-item override** — any failed *critical* checkpoint forces an overall **Fail**, no matter how high the score.
- **Severity-weighted score** — a 0–100 score where major and critical issues count more heavily than minor ones, so the number reflects real risk, not just a count of ticks.
- **Verdict tiers:**
  - **Pass** — score above threshold and no critical failures.
  - **Conditional pass** — acceptable overall but with open minor issues that must be corrected by a deadline.
  - **Fail** — below threshold, or any critical failure.

**Follow-up generation.** The verdict drives action automatically:
- A *conditional pass* generates a list of correction items, each with a correction deadline.
- A *fail* schedules a mandatory **re-inspection**, with the due date derived from the most severe issue present (more severe → sooner).

The value here is that the verdict is explainable and consistent: the same inputs always yield the same decision, and a user can see exactly *why* — e.g. "scored 88 but failed because a critical gas-leak checkpoint failed, re-inspection due in 3 days."

### 6.5 Inspection report

Every completed inspection produces a structured, shareable report containing:
- Header: item inspected, inspector, date/time, and **location**
- A prominent verdict badge (Pass / Conditional / Fail) and the score
- Section-by-section results, with failed and warning items highlighted
- Attached photos and notes in context
- The list of required corrections and their deadlines
- The scheduled re-inspection date, if any

The report is the artifact a manager reviews, an auditor receives, or a record is kept against. A clean on-screen and print-friendly view is sufficient for Phase 1.

### 6.6 Lifecycle and dashboard

Each inspection moves through a clear status:

> **Draft → Submitted → (Passed / Conditional / Failed) → Re-inspection scheduled → Closed**

A central dashboard gives the "this is a real operation" view:
- Open and in-progress inspections
- Recent verdicts
- **Overdue re-inspections** and corrections past their deadline, surfaced prominently
- A view of items and their latest status

This closes the loop so failures and required follow-ups don't get lost.

---

## 7. Core user flows

**Create a form (admin):**
Choose "new form" → name it and pick its type → add sections and checkpoints → for each checkpoint set answer type, severity, critical flag, and any ranges → save. The form is now reusable.

**Register an item (admin/inspector):**
Add an item → name, type, location → it's now selectable in inspections and accumulates history.

**Perform an inspection (inspector):**
Pick a form and an item → location is captured → walk the checkpoints, entering answers, notes, and photos → save as draft or submit → receive a verdict and report instantly.

**Follow up (manager):**
Open the dashboard → see failed/conditional results and overdue re-inspections → open a report → track corrections to closure → re-inspect when due.

---

## 8. Phase 2 direction (informational, not in scope)

inspkt's domain was chosen so that AI assistance can later slot cleanly into the existing flow. The intended direction:

- An AI assistant reads the photos and free-text notes captured during an inspection and **proposes** the result for each checkpoint — a satisfied/warn/fail judgment plus a severity classification and a drafted findings narrative.
- It can flag inconsistencies (e.g. a note that says "looks fine" attached to a photo showing visible damage).
- Crucially, its proposed results feed the **same verdict engine** a human submission does. The AI assists capture and judgment; the rules engine still decides the verdict. A human reviews and confirms.

The Phase 1 design intent that supports this: forms and inspection results are structured and explicit, so an assistant has a clear rubric to grade against and a clear output format to produce. No Phase 2 functionality is built in Phase 1, but Phase 1 should avoid choices that would make this assistance awkward to add later.

---
