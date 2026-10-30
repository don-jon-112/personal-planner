import { NextRequest, NextResponse } from 'next/server';

interface EnvItem {
  key: string;
  value: string;
  target?: string[];
}

// 1. GET status: check if Vercel ENV credentials are configured on the server
export async function GET() {
  const hasToken = Boolean(process.env.VERCEL_ACCESS_TOKEN);
  const hasProjectId = Boolean(process.env.VERCEL_PROJECT_ID);
  const isConfigured = hasToken && hasProjectId;

  return NextResponse.json({
    configured: isConfigured,
    hasToken,
    hasProjectId,
    message: isConfigured
      ? 'Vercel API siap digunakan via Server Environment Variables.'
      : 'VERCEL_ACCESS_TOKEN atau VERCEL_PROJECT_ID belum diset di server.',
  });
}

// 2. POST: Update environment variables and optionally trigger redeploy
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vercelToken: customToken,
      projectId: customProjectId,
      teamId: customTeamId,
      envs,
      triggerDeploy = true,
    } = body;

    const token = customToken || process.env.VERCEL_ACCESS_TOKEN;
    const projectId = customProjectId || process.env.VERCEL_PROJECT_ID;
    const teamId = customTeamId || process.env.VERCEL_TEAM_ID;

    // Generate plain text snippet for manual copy-paste as well
    const envSnippet = Array.isArray(envs)
      ? envs.map((e: EnvItem) => `${e.key}="${e.value}"`).join('\n')
      : '';

    // If no token or projectId provided, return the generated snippet
    if (!token || !projectId) {
      return NextResponse.json({
        success: false,
        message: 'VERCEL_ACCESS_TOKEN atau VERCEL_PROJECT_ID belum diset di server (atau form). Anda dapat menyalin konfigurasi ENV di bawah ini secara manual.',
        envSnippet,
        canAutoDeploy: false,
      });
    }

    if (!Array.isArray(envs) || envs.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Tidak ada daftar environment variables yang dikirim.',
        envSnippet,
      }, { status: 400 });
    }

    const teamQuery = teamId ? `?teamId=${teamId}` : '';
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // 1. Fetch existing env variables to know whether to POST or PATCH
    const getRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`, {
      method: 'GET',
      headers,
    });

    if (!getRes.ok) {
      const errData = await getRes.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        message: `Gagal mengakses project Vercel: ${errData?.error?.message || getRes.statusText}`,
        envSnippet,
      }, { status: getRes.status });
    }

    const existingData = await getRes.json();
    const existingEnvs: any[] = existingData?.envs || [];

    // 2. Upsert each environment variable
    const updateResults: any[] = [];
    for (const item of envs) {
      const existing = existingEnvs.find((e) => e.key === item.key);
      const target = item.target || ['production', 'preview', 'development'];

      if (existing) {
        // Edit existing env
        const patchRes = await fetch(
          `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}${teamQuery}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              value: item.value,
              target,
            }),
          }
        );
        updateResults.push({ key: item.key, status: patchRes.ok ? 'updated' : 'failed' });
      } else {
        // Create new env
        const postRes = await fetch(
          `https://api.vercel.com/v10/projects/${projectId}/env${teamQuery}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              key: item.key,
              value: item.value,
              type: 'plain',
              target,
            }),
          }
        );
        updateResults.push({ key: item.key, status: postRes.ok ? 'created' : 'failed' });
      }
    }

    // 3. Trigger deployment if requested so new ENV takes effect immediately
    let deployResult: any = null;
    if (triggerDeploy) {
      try {
        const deployRes = await fetch(`https://api.vercel.com/v13/deployments${teamQuery}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: projectId,
            project: projectId,
          }),
        });
        deployResult = await deployRes.json().catch(() => null);
      } catch (deployErr) {
        console.warn('Vercel deploy trigger failed:', deployErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Environment variables di Vercel berhasil diperbarui!',
      envSnippet,
      updateResults,
      deployed: Boolean(deployResult?.id),
    });
  } catch (error: any) {
    console.error('Update Vercel ENV error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
