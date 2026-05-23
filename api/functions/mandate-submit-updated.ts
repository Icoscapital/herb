import { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get authenticated user
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Extract mandate from request
    const { theme, keywords, geography, stage, search_mode, special_instructions } = req.body

    if (!theme) {
      return res.status(400).json({ error: 'Theme is required' })
    }

    // Generate slug
    const date = new Date().toISOString().split('T')[0]
    const themeSlug = theme
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 20)
    const slug = `${date}-${themeSlug}`

    // Create run in database
    const { data: run, error: insertError } = await supabase
      .from('herb_runs')
      .insert([
        {
          user_id: user.id,
          slug,
          theme,
          keywords: keywords || null,
          geography: geography || 'Europe',
          stage: stage || 'Series A/B',
          search_mode: search_mode || 'DEEP',
          status: 'SEARCHING',
          current_round: 1,
          special_instructions: special_instructions || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (insertError) {
      console.error('Database error:', insertError)
      return res.status(500).json({ error: 'Failed to create run' })
    }

    // Trigger GitHub Actions workflow (dispatch event)
    try {
      const mandate = {
        run_id: run.id,
        user_id: user.id,
        slug: run.slug,
        theme: run.theme,
        keywords: run.keywords,
        geography: run.geography,
        stage: run.stage,
        search_mode: run.search_mode,
        special_instructions: run.special_instructions,
        user_email: user.email,
      }

      // Call GitHub API to trigger workflow
      const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT
      if (githubToken) {
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
        console.log(`Triggered GitHub Actions for ${slug}`)
      } else {
        console.warn('GitHub token not configured - search will not execute')
      }
    } catch (workflowError) {
      console.error('Failed to trigger workflow:', workflowError)
      // Don't fail the API call, just log it
    }

    const estimatedTime = search_mode === 'DEEP' ? '3-5 hours' : '1 hour'

    return res.status(200).json({
      runId: run.id,
      slug: run.slug,
      estimatedTime,
      status: 'SEARCHING',
      message: `Search started for "${theme}". Herb is searching now. You'll receive an email when results are ready.`,
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
