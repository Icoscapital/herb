"""
Pipedrive Deal Creator for Web Dashboard
Auto-create deals when user approves final companies for entry
"""
import os
from scripts.pipedrive_client import PipedriveClient

class PipedriveWebCreator:
    def __init__(self):
        self.client = PipedriveClient()
        self.user_id = os.getenv('USER_PIPEDRIVE_ID')
        self.investment_manager_option = os.getenv('USER_INVESTMENT_MANAGER_OPTION_ID')
        self.pipeline_id = os.getenv('DEFAULT_PIPELINE_ID', '9')
        self.stage_id = os.getenv('DEFAULT_STAGE_ID', '141')
    
    def create_deal_for_company(self, company_name: str, domain: str, run_id: str) -> dict:
        """
        Create a Pipedrive deal for an approved company
        
        Returns: {'status': 'created'|'skipped'|'error', 'deal_id': int, 'message': str}
        """
        try:
            # Search for existing org
            existing_org = self.client.search_organizations(company_name)
            
            if existing_org:
                org_id = existing_org['id']
                org_name = existing_org['name']
            else:
                # Create new org
                org_data = self.client.create_organization(
                    name=company_name,
                    website=domain if domain else None
                )
                org_id = org_data['id']
                org_name = org_data['name']
            
            # Create person (contact) if needed
            # For web dashboard, use generic contact
            person_data = self.client.create_person(
                name=f'{company_name} Contact',
                org_id=org_id,
                email=f'contact@{domain}' if domain else None
            )
            person_id = person_data['id']
            
            # Create deal in Icos pipeline
            deal_data = self.client.create_deal(
                title=f'{company_name} - Web Search',
                org_id=org_id,
                person_id=person_id,
                pipeline_id=int(self.pipeline_id),
                stage_id=int(self.stage_id),
                owner_id=int(self.user_id),
                custom_fields={
                    'investment_manager': self.investment_manager_option
                }
            )
            
            deal_id = deal_data['id']
            
            return {
                'status': 'created',
                'deal_id': deal_id,
                'org_id': org_id,
                'person_id': person_id,
                'message': f'Deal created: {company_name} (#{deal_id})'
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'deal_id': None,
                'message': f'Failed to create deal: {str(e)}'
            }
    
    def create_deals_for_companies(self, companies: list, run_id: str) -> dict:
        """
        Batch create deals for multiple approved companies
        
        companies = [
            {'name': 'Company A', 'domain': 'company-a.com'},
            {'name': 'Company B', 'domain': 'company-b.com'},
        ]
        """
        results = {
            'created': [],
            'failed': [],
            'total': len(companies)
        }
        
        for company in companies:
            result = self.create_deal_for_company(
                company['name'],
                company.get('domain', ''),
                run_id
            )
            
            if result['status'] == 'created':
                results['created'].append({
                    'company': company['name'],
                    'deal_id': result['deal_id']
                })
            else:
                results['failed'].append({
                    'company': company['name'],
                    'error': result['message']
                })
        
        return results

if __name__ == '__main__':
    creator = PipedriveWebCreator()
    # Test
    result = creator.create_deal_for_company('Test Company', 'test.com', 'run-123')
    print(result)
