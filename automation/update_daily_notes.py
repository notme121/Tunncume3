#!/usr/bin/env python3
"""
GI System Course 2026 — Daily Learning Notes & Syllabus Automation Script
CU-MEDi 3030346

This script allows you to automate daily updates to your course learning hub:
- Add daily lecture slides / handout URLs
- Inject high-yield clinical pearls
- Add deep pathophysiology notes and mechanism tracers
- Update personal notes

Usage Examples:
  1. Show current session status:
     python3 automation/update_daily_notes.py --show session_1

  2. Update session pearls and notes:
     python3 automation/update_daily_notes.py --session 1 \
       --pearls "Celiac trunk trifurcates at T12 | Posterior D1 ulcers bleed via GDA" \
       --notes "Attended lecture with Dr. Varalee. Key focus was arterial arcades." \
       --slides "https://drive.google.com/your-slide-deck-link"

  3. Update from a structured JSON file (e.g. LLM generated after lecture):
     python3 automation/update_daily_notes.py --json today_lecture.json

  4. List all 57 sessions:
     python3 automation/update_daily_notes.py --list
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT_DIR, 'data', 'gi_daily_learning_data.js')
BUILD_SCRIPT = os.path.join(ROOT_DIR, 'automation', 'build_standalone.py')

def load_data():
    if not os.path.exists(DATA_FILE):
        print(f"Error: {DATA_FILE} not found!")
        sys.exit(1)
    
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract window.GI_DAILY_LEARNING and window.GI_EXAM_BLUEPRINT
    match_daily = re.search(r'window\.GI_DAILY_LEARNING\s*=\s*(\{.*?\});\s*$', content, re.DOTALL)
    match_blueprint = re.search(r'window\.GI_EXAM_BLUEPRINT\s*=\s*(\{.*?\});', content, re.DOTALL)

    if not match_daily or not match_blueprint:
        print("Error: Could not parse JS data file structure.")
        sys.exit(1)

    blueprint = json.loads(match_blueprint.group(1))
    daily_learning = json.loads(match_daily.group(1))
    return blueprint, daily_learning

def save_data(blueprint, daily_learning, auto_rebuild=True, git_commit_msg=None, push_to_git=False):
    output_content = f"""/**
 * GI System Course 2026 — Master Daily Learning & Exam Coverage Data
 * Standalone Offline-First Architecture for CU-MEDi 3030346
 * Generated: Preliminary Syllabus, Behavioral Objectives, & Exam Blueprint
 * 
 * AUTOMATION NOTE:
 * You can update this file daily using the script: `python3 automation/update_daily_notes.py`
 * or by directly editing the entries in `window.GI_DAILY_LEARNING["session_X"]`.
 */

window.GI_EXAM_BLUEPRINT = {json.dumps(blueprint, indent=2)};

window.GI_DAILY_LEARNING = {json.dumps(daily_learning, indent=2)};
"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        f.write(output_content)
    print(f"✓ Saved updates to {DATA_FILE}")

    if auto_rebuild and os.path.exists(BUILD_SCRIPT):
        try:
            subprocess.run([sys.executable, BUILD_SCRIPT], cwd=ROOT_DIR, check=True)
        except Exception as e:
            print(f"Note: Standalone rebuild skipped ({e})")

    if git_commit_msg or push_to_git:
        handle_git_sync(git_commit_msg or "Daily course update: notes & pearls", push_to_git)


def handle_git_sync(commit_msg, push_to_git):
    try:
        # Check if git is initialized
        if not os.path.exists(os.path.join(ROOT_DIR, '.git')):
            print("Note: Git repository not initialized yet. Skipping git commit.")
            return

        subprocess.run(["git", "add", "data/", "GI_CUMEDi_Standalone_App.html", "index.html"], cwd=ROOT_DIR, check=True)
        # Commit if changes are staged
        status = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT_DIR, capture_output=True, text=True)
        if status.stdout.strip():
            subprocess.run(["git", "commit", "-m", commit_msg], cwd=ROOT_DIR, check=True)
            print(f"✓ Git committed: \"{commit_msg}\"")
        else:
            print("✓ Git working tree already clean.")

        if push_to_git:
            # Check if remote exists
            remotes = subprocess.run(["git", "remote"], cwd=ROOT_DIR, capture_output=True, text=True)
            if remotes.stdout.strip():
                print("🚀 Pushing daily updates to Git remote...")
                subprocess.run(["git", "push"], cwd=ROOT_DIR, check=True)
                print("✓ Successfully pushed to remote repository!")
            else:
                print("Note: No git remote configured yet. Add one with: git remote add origin <url>")
    except Exception as e:
        print(f"Git sync warning: {e}")


def resolve_session_key(query, daily_learning):
    """Smart session resolver:
    1. Exact key match: 'session_17'
    2. Syllabus session number match: '16' -> 'session_17' (Syllabus Session 16: Approach to nausea vomiting)
    3. Array index fallback: 'session_' + query
    4. Fuzzy topic match: 'nausea' -> 'session_17'
    """
    query_str = str(query).strip()
    if query_str in daily_learning:
        return query_str

    if query_str.startswith('session_') and query_str in daily_learning:
        return query_str

    clean_num = query_str.replace('session_', '').strip()

    # Priority A: Match by syllabus Session Number (e.g. Session 16 -> session_17)
    syllabus_matches = []
    for k, s in daily_learning.items():
        s_no = str(s.get('sessionNo') or s.get('no') or '').strip()
        if s_no == clean_num:
            syllabus_matches.append((k, s))
        elif f"& {clean_num}" in s_no or f"{clean_num} &" in s_no:
            syllabus_matches.append((k, s))

    if len(syllabus_matches) == 1:
        match_key, match_s = syllabus_matches[0]
        if match_key != f"session_{clean_num}":
            print(f"ℹ️ Resolved Syllabus Session {clean_num} → [{match_key}] \"{match_s.get('topic')}\"")
            print(f"   (To target array index {clean_num} specifically, pass --session session_{clean_num})")
        return match_key

    # Priority B: Direct array index
    key_by_index = f"session_{clean_num}"
    if key_by_index in daily_learning:
        return key_by_index

    # Priority C: Substring in topic
    topic_matches = []
    for k, s in daily_learning.items():
        if query_str.lower() in (s.get('topic') or '').lower():
            topic_matches.append(k)

    if len(topic_matches) == 1:
        match_key = topic_matches[0]
        print(f"ℹ️ Resolved topic query \"{query_str}\" → [{match_key}] \"{daily_learning[match_key].get('topic')}\"")
        return match_key

    return None


def main():
    parser = argparse.ArgumentParser(description="Automate daily updates to GI Course Learning Hub (CU-MEDi 3030346)")
    parser.add_argument('--session', type=str, help="Session key or syllabus number (e.g. '16', 'session_17', 'nausea')")
    parser.add_argument('--pearls', type=str, help="Pipe-separated high-yield pearls: 'Pearl 1 | Pearl 2'")
    parser.add_argument('--deep', type=str, help="Deep understanding / pathophysiology text")
    parser.add_argument('--notes', type=str, help="Student personal notes for this session")
    parser.add_argument('--slides', type=str, help="URL to lecture slides or handout")
    parser.add_argument('--recalls', type=str, help="Double-semicolon or pipe separated recalls: 'Q: question | A: answer ;; Q: question | A: answer'")
    parser.add_argument('--json', type=str, help="Path to JSON file with daily updates")
    parser.add_argument('--list', action='store_true', help="List all sessions and update status")
    parser.add_argument('--show', type=str, help="Show session details by syllabus number, key, or topic")
    parser.add_argument('--push', action='store_true', help="Automatically commit and push changes to Git remote")
    parser.add_argument('--no-rebuild', action='store_true', help="Skip rebuilding standalone HTML file")
    args = parser.parse_args()

    blueprint, daily_learning = load_data()

    if args.list:
        print("\n=== GI COURSE SESSIONS & STATUS (57 SESSIONS) ===")
        print(f"{'Status':<8} {'Key':<12} {'Syllabus No.':<14} {'Date & Week':<16} {'Topic'}")
        print("-" * 80)
        for key, s in daily_learning.items():
            status_icon = "🟢 Done" if s.get('status') == "Updated with Lecture Material" else "⚪ Prelim"
            has_notes = "📝" if s.get('dailyNotes') else "  "
            has_slides = "📑" if s.get('slideLinks') else "  "
            s_no = s.get('sessionNo') or s.get('no') or '-'
            week_date = f"W{s.get('week')} {s.get('date')[:6]}"
            topic_abbr = (s.get('topic') or '')[:38]
            print(f"{status_icon:<8} [{key:<10}] S{str(s_no):<12} {week_date:<16} {topic_abbr:<38} {has_notes}{has_slides}")
        return

    if args.show:
        target_key = resolve_session_key(args.show, daily_learning)
        if not target_key or target_key not in daily_learning:
            print(f"Error: Session \"{args.show}\" could not be resolved. Use --list to see all available sessions.")
            return
        s = daily_learning[target_key]
        s_no = s.get('sessionNo') or s.get('no') or '-'
        print(f"\n=== {s.get('topic')} [{target_key} | Syllabus Session {s_no}] ===")
        print(f"Week {s.get('week')} | {s.get('date')} {s.get('time')} | Room: {s.get('location')} | Eval: {s.get('evalTrack')}")
        print(f"Pre-class: {s.get('preClass')}")
        print("\n🎯 Objectives:")
        for obj in s.get('objectives', []):
            print(f"  • {obj}")
        print("\n⚡ Quick Review Pearls:")
        for p in s.get('quickReview', []):
            print(f"  • {p}")
        if s.get('dailyNotes'):
            print(f"\n📘 Master Daily Notes / Guide:\n{s.get('dailyNotes')}")
        if s.get('activeRecalls'):
            print(f"\n🎴 Active Recall Flashcards ({len(s.get('activeRecalls'))} Cards):")
            for idx, r in enumerate(s.get('activeRecalls'), 1):
                print(f"  Q{idx}: {r.get('q')}")
                if r.get('a'):
                    print(f"  A{idx}: {r.get('a')}")
        return

    if args.json:
        if not os.path.exists(args.json):
            print(f"Error: JSON file '{args.json}' not found.")
            return
        with open(args.json, 'r', encoding='utf-8') as jf:
            payload = json.load(jf)

        updated_keys = []
        if 'session_id' in payload:
            target_key = resolve_session_key(payload['session_id'], daily_learning)
            if target_key and target_key in daily_learning:
                s = daily_learning[target_key]
                for fld in ['quickReview', 'deepUnderstanding', 'dailyNotes', 'slideLinks', 'activeRecalls', 'mcqs']:
                    if fld in payload: s[fld] = payload[fld]
                s['status'] = "Updated with Lecture Material"
                updated_keys.append(target_key)
                print(f"✓ Updated {target_key} from {args.json}")
        else:
            for k, val in payload.items():
                target_key = resolve_session_key(k, daily_learning)
                if target_key and target_key in daily_learning:
                    daily_learning[target_key].update(val)
                    daily_learning[target_key]['status'] = "Updated with Lecture Material"
                    updated_keys.append(target_key)
                    print(f"✓ Updated {target_key}")

        commit_msg = f"Daily update via JSON: {', '.join(updated_keys)}"
        save_data(blueprint, daily_learning, auto_rebuild=not args.no_rebuild, git_commit_msg=commit_msg, push_to_git=args.push)
        return

    if args.session:
        target_key = resolve_session_key(args.session, daily_learning)
        if not target_key or target_key not in daily_learning:
            print(f"Error: Session \"{args.session}\" could not be resolved. Use --list to see all available sessions.")
            return

        s = daily_learning[target_key]
        if args.pearls:
            pearl_items = [p.strip() for p in args.pearls.split('|') if p.strip()]
            s['quickReview'] = pearl_items
        if args.deep:
            s['deepUnderstanding'] = args.deep
        if args.notes:
            s['dailyNotes'] = args.notes
        if args.slides:
            if 'slideLinks' not in s: s['slideLinks'] = []
            s['slideLinks'].append({"title": "Lecture Slides", "url": args.slides})
        if args.recalls:
            recalls_list = []
            raw_pairs = [pair.strip() for pair in args.recalls.split(';;') if pair.strip()]
            for pair in raw_pairs:
                if '|' in pair:
                    parts = pair.split('|', 1)
                    q = parts[0].replace('Q:', '').strip()
                    a = parts[1].replace('A:', '').strip()
                    recalls_list.append({"q": q, "a": a})
                else:
                    recalls_list.append({"q": pair, "a": ""})
            s['activeRecalls'] = recalls_list
        
        s['status'] = "Updated with Lecture Material"
        topic_name = s.get('topic') or target_key
        print(f"✓ Successfully updated [{target_key}] ({topic_name})")
        commit_msg = f"Daily update: [{target_key}] {topic_name}"
        save_data(blueprint, daily_learning, auto_rebuild=not args.no_rebuild, git_commit_msg=commit_msg, push_to_git=args.push)
        return

    parser.print_help()

if __name__ == '__main__':
    main()

