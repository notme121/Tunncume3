# CUMEDi Exam & Quiz Generation System Specification

This specification defines the exact exam style and item-writing rules analyzed from previous CUMEDi exams. Use this whenever generating quizzes, active recall MCQs, or mock exam blocks for the GI Course Companion web app (`index.html`).

## 1. Item Format
- **5-Option Single-Best-Answer (A–E)**: Every question must have 5 choices (`A`, `B`, `C`, `D`, `E`).
- **Strictly Homogeneous Option Categories**: All 5 choices must belong to the exact same entity type (e.g., all mechanisms, all nerves, all lab tests, or all drugs).
- **No Meta-Options**: Zero `"All of the above"` or `"None of the above"`.
- **Length Ordering**: Order options A through E by length from **shortest to longest**.

## 2. Cognitive Distribution
- **15% 1st-Order (Direct Recall)**:
  - 1–2 sentence stems testing pathognomonic signs, cytokine/receptor pairings, or distinct anatomical landmarks.
- **65% 2nd-Order (Silent Diagnosis $\rightarrow$ Mechanism/Target)**:
  - 3–5 sentence clinical vignettes where the diagnosis is **not** asked directly.
  - The student must deduce the condition silently and identify the impaired physiological step, damaged anatomical structure, causative toxin/mutation, or confirmatory test.
- **20% 3rd-Order (Quantitative & Multi-Step Synthesis)**:
  - Vignettes with full numerical lab panels (always including parenthetical reference ranges) or multi-link anatomical/physiological chains requiring differentiation between close mimics or selecting the next management priority.

## 3. Textualizing Visuals
- Replace histology, blood smears, dermoscopy, endoscopy, and radiographs with **literal morphological descriptions** in the stem (e.g., describing *"basaloid cells with peripheral palisading"* or *"enlarged RBCs with Schüffner's dots and 16 merozoites"*) rather than naming the buzzword or relying on an image.

## 4. Distractor Logic
Build the 4 wrong options using:
1. **Exact Physiological Opposites**: e.g., upregulated vs. downregulated, left vs. right.
2. **Adjacent Cascade Steps**: True statements that happen earlier or later in the same pathway.
3. **Anatomical Neighbors**: Structures sharing the same canal, space, vascular supply, or joint.
4. **#2 Differential Findings**: Features belonging to the closest clinical mimic.

## 5. Explanation Style
- **2–3 sentences maximum**:
  1. State the **unspoken diagnosis** first.
  2. Link the stem's **key clue** to the correct mechanism/structure.
  3. Briefly note why the **closest mimic** is excluded.
