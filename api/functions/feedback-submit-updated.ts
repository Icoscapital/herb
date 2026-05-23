import { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const githubToken = process.env.GITHUB_TOKEN || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const runId = req.query.id as string
    const { feedback, feedback_type, companies_mentioned } = req.body

    // Verify ownership
    const { data: run, error: runError } = await supabase
      .from('herb_runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', user.id)
      .single()

    if (runError || !run) {
      return res.status(404).json({ error: 'Run not found' })
    }

    // Insert feedback
    const { error: insertError } = await supabase
      .from('herb_feedback')
      .insert([
        {
          run_id: runId,
          user_id: user.id,
          feedback_text: feedback,
          feedback_type,
          companies_mentioned: companies_mentioned || [],
          created_at: new Date().toISOString(),
        },
      ])

    if (insertError) {
      console.error('Database error:', insertError)
      return res.status(500).json({ error: 'Failed to submit feedback' })
    }

    // Handle feedback type
    let newStatus = 'FEEDBACK_PENDING'
    let newRound = run.current_round
    let triggerSearch = false

    if (feedback_type === 'FINALIZE') {
      newStatus = 'COMPLETE'
    } else if (feedback_type === 'ITERATE') {
      newStatus = 'SEARCHING'
      newRound = run.current_round + 1
      triggerSearch = true
    } else if (feedback_type === 'SCORE') {
      newStatus = 'FEEDBACK_PENDING'
      // Would trigger icos-fit-eval on specific companies
    }

    const { error: updateError } = await supabase
      .from('herb_runs')
      .update({
        status: newStatus,
        current_round: newRound,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)

    if (updateError) {
      console.error('Update error:', updateError)
      return res.status(500).json({ error: 'Failed to update run status' })
    }

    // Trigger next search if iterating
    if (triggerSearch && githubToken) {
      try {
        const mandate = {
          run_id: runId,
          user_id: user.id,
          slug: run.slug,
          theme: run.theme,
          keywords: run.keywords,
          geography: run.geography,
          stage: run.stage,
          search_mode: run.search_mode,
          special_instructions: feedback || run.special_instructions,
          user_email: user.email,
        }

        await axios.post(
          'https://api.github.com/repos/Icoscapital/herb/dispatches',
          {
            event_type: 'herb-web-search',
            client_payload: { mandate },
          },
          {
            headers: {
              'Authorization': `token ${githubToken}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          }
        )
        console.log(`Triggered Round ${newRound} search for ${run.slug}`)
      } catch (workflowError) {
        console.warn('Workflow trigger failed:', workflowError)
      }
    }

    return res.status(200).json({
      status: 'Feedback submitted',
      newStatus,
      newRound,
      message: newStatus === 'SEARCHING' 
        ? `Round ${newRound} search started. You'll get results in 1-3 hours.`
        : `Feedback recorded. ${newStatus === 'COMPLETE' ? 'Ready for Pipedrive entry.' : ''}`,
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
