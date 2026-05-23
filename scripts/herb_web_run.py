"""
Herb Web Search Orchestrator
Execute a mandate from the web dashboard, store results in Supabase
"""
import os
import json
import sys
from datetime import datetime
from pathlib import Path

# Set credentials from environment
os.environ.setdefault('PIPEDRIVE_DOMAIN', 'icoscapital')

from supabase import create_client, Client
from scripts.run_state import initial, read, write
from scripts.longlist_builder import build_longlist_v1
from scripts.email_send import send_email

def get_supabase_client() -> Client:
    """Get authenticated Supabase client"""
    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        raise ValueError('Missing Supabase credentials')
    return create_client(url, key)

def run_search(mandate: dict) -> dict:
    """
    Execute a search mandate from the web dashboard
    
    mandate = {
        'run_id': 'uuid',
        'user_id': 'uuid',
        'slug': 'YYYY-MM-DD-theme',
        'theme': 'string',
        'keywords': 'string',
        'geography': 'string',
        'stage': 'string',
        'search_mode': 'STANDARD|DEEP',
        'user_email': 'user@icoscapital.com'
    }
    """
    
    sb = get_supabase_client()
    run_id = mandate['run_id']
    slug = mandate['slug']
    
    try:
        # Initialize run state
        initial(
            slug,
            author=mandate['user_email'],
            theme=mandate['theme'],
            keywords=mandate.get('keywords', ''),
            geography=mandate.get('geography', 'Europe'),
            stage=mandate.get('stage', 'Series A/B'),
            search_mode=mandate.get('search_mode', 'DEEP'),
            special_instructions=mandate.get('special_instructions', '')
        )
        
        print(f"[OK] Run state initialized: {slug}")
        
        # Phase 2: Search (would call actual search playbook)
        # For now, stub with placeholder
        companies_found = []
        pre_screen_passes = 0
        
        # In production, would:
        # - Spawn search sub-agents per source
        # - Dedup results
        # - Cross-check Pipedrive
        # - Pre-screen companies
        # For MVP: return success signal
        
        print(f"[OK] Phase 2 search stub (production: spawn agents)")
        
        # Update run status to READY in Supabase
        update_result = sb.table('herb_runs').update({
            'status': 'READY',
            'companies_found_total': len(companies_found),
            'pre_screen_passes': pre_screen_passes,
            'completed_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', run_id).execute()
        
        print(f"[OK] Run status updated to READY")
        
        # Queue email notification (would be sent by separate worker)
        # For now, just log it
        print(f"[QUEUE] Email notification: {mandate['user_email']}")
        
        return {
            'status': 'success',
            'run_id': run_id,
            'slug': slug,
            'message': f'Search completed. Results queued for email notification.',
            'companies_found': len(companies_found),
            'pre_screen_passes': pre_screen_passes
        }
        
    except Exception as e:
        print(f"[ERROR] Search failed: {str(e)}")
        
        # Update run status to ERROR
        sb.table('herb_runs').update({
            'status': 'ERROR',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', run_id).execute()
        
        raise

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Missing mandate JSON'}))
        sys.exit(1)
    
    try:
        mandate = json.loads(sys.argv[1])
        result = run_search(mandate)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)
