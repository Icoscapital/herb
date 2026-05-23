"""
Email Notifier - Send T4 notifications when search completes
Uses Microsoft Graph API to send emails from herb@icoscapital.com
"""
import os
import requests
from datetime import datetime

class EmailNotifier:
    def __init__(self):
        self.tenant_id = os.getenv('GRAPH_TENANT_ID')
        self.client_id = os.getenv('GRAPH_CLIENT_ID')
        self.client_secret = os.getenv('GRAPH_CLIENT_SECRET')
        self.herb_mailbox = 'herb@icoscapital.com'
        self.token = None
        
    def _get_token(self) -> str:
        """Get Microsoft Graph API token"""
        if self.token:
            return self.token
            
        resp = requests.post(
            f'https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token',
            data={
                'grant_type': 'client_credentials',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'scope': 'https://graph.microsoft.com/.default',
            },
            timeout=30
        )
        resp.raise_for_status()
        self.token = resp.json()['access_token']
        return self.token
    
    def send_results_notification(self, user_email: str, slug: str, round_num: int, company_count: int):
        """
        Send T4-style email notification when results are ready
        """
        token = self._get_token()
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        dashboard_link = f'https://herb.icoscapital.com/results/{slug}'
        
        subject = f'Herb — Long List Draft {round_num} Ready — {slug}'
        
        body = f"""Hi {user_email.split('@')[0].title()},

Round {round_num} search is complete!

**Results Summary:**
- Companies found: {company_count}
- Ready for review: Check your dashboard

**Next Steps:**
1. Visit: {dashboard_link}
2. Review results and Icos Fit scores
3. Download Excel longlist
4. Submit feedback:
   - Request another round of searching
   - Ask me to score companies
   - Finalize this list

Herb will process your feedback and send next results.

—Herb
Icos Capital Sourcing Agent
"""
        
        # Send via Graph API
        url = f'https://graph.microsoft.com/v1.0/users/{self.herb_mailbox}/sendMail'
        
        payload = {
            'message': {
                'subject': subject,
                'body': {
                    'contentType': 'text',
                    'content': body
                },
                'toRecipients': [
                    {'emailAddress': {'address': user_email}}
                ]
            }
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        
        return {'status': 'sent', 'to': user_email, 'subject': subject}
    
    def send_finalization_email(self, user_email: str, slug: str, company_count: int):
        """Send final report email (T5)"""
        token = self._get_token()
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        dashboard_link = f'https://herb.icoscapital.com/results/{slug}'
        
        subject = f'Herb — Final Report — {slug}'
        
        body = f"""Hi {user_email.split('@')[0].title()},

Final report is ready.

**Summary:**
- Total companies: {company_count}
- Status: Ready for Pipedrive entry

**Next Step:**
Visit {dashboard_link} and approve companies for Pipedrive entry.

—Herb
Icos Capital Sourcing Agent
"""
        
        url = f'https://graph.microsoft.com/v1.0/users/{self.herb_mailbox}/sendMail'
        
        payload = {
            'message': {
                'subject': subject,
                'body': {
                    'contentType': 'text',
                    'content': body
                },
                'toRecipients': [
                    {'emailAddress': {'address': user_email}}
                ]
            }
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        
        return {'status': 'sent', 'to': user_email, 'subject': subject}

if __name__ == '__main__':
    notifier = EmailNotifier()
    # Test
    result = notifier.send_results_notification(
        'test@icoscapital.com',
        '2026-05-23-test-mandate',
        1,
        15
    )
    print(result)
