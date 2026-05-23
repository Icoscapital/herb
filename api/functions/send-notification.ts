import { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { run_id, type } = req.body

    if (!run_id || !type) {
      return res.status(400).json({ error: 'Missing run_id or type' })
    }

    // Get run details from Supabase
    const { data: run, error: runError } = await supabase
      .from('herb_runs')
      .select('*')
      .eq('id', run_id)
      .single()

    if (runError || !run) {
      return res.status(404).json({ error: 'Run not found' })
    }

    // Spawn Python email notifier in background
    const emailerProcess = spawn('python', [
      '-m', 'scripts.email_notifier',
      JSON.stringify({
        user_email: run.author_email || 'herb@icoscapital.com',
        slug: run.slug,
        round_num: run.current_round,
        type: type, // 'results' or 'finalization'
      }),
    ], {
      detached: true,
      stdio: 'ignore',
    })

    // Don't wait for completion, return immediately
    emailerProcess.unref()

    return res.status(202).json({
      status: 'notification_queued',
      run_id,
      type,
      message: `Email notification queued for ${run.slug}`,
    })
  } catch (error) {
    console.error('Notification error:', error)
    return res.status(500).json({ error: 'Failed to queue notification' })
  }
}
