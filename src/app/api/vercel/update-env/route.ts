import { NextRequest, NextResponse } from 'next/server';

interface EnvItem {
  key: string;
  value: string;
  target?: string[];
}

// 1. GET status: check if Vercel ENV credentials or deploy hook are configured on the server
export async function GET() {
  const hasToken = Boolean(process.env.VERCEL_ACCESS_TOKEN);
  const hasProjectId = Boolean(process.env.VERCEL_PROJECT_ID);
  const hasDeployHook = Boolean(process.env.VERCEL_DEPLOY_HOOK_URL);
  const isConfigured = (hasToken && hasProjectId) || hasDeployHook;

  return NextResponse.json({
    configured: isConfigured,
    hasToken,
    hasProjectId,
    hasDeployHook,
    message: isConfigured
      ? 'Vercel API / Deploy Hook siap digunakan.'
      : 'VERCEL_ACCESS_TOKEN atau VERCEL_PROJECT_ID belum diset di server.',
  });
}

// 2. POST: Update environment variables and trigger redeploy
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vercelToken: customToken,
      projectId: customProjectId,
      teamId: customTeamId,
      deployHookUrl: customDeployHookUrl,
      envs,
      triggerDeploy = true,
    } = body;

    const token = customToken || process.env.VERCEL_ACCESS_TOKEN;
    const projectId = customProjectId || process.env.VERCEL_PROJECT_ID;
    const teamId = customTeamId || process.env.VERCEL_TEAM_ID;
    const deployHookUrl = customDeployHookUrl || process.env.VERCEL_DEPLOY_HOOK_URL;

    // Generate plain text snippet for manual copy-paste as well
    const envSnippet = Array.isArray(envs)
      ? envs.map((e: EnvItem) => `${e.key}="${e.value}"`).join('\n')
      : '';

    // If no token/projectId provided and no hook, return the generated snippet
    if ((!token || !projectId) && !deployHookUrl) {
      return NextResponse.json({
        success: false,
        message: 'VERCEL_ACCESS_TOKEN atau VERCEL_PROJECT_ID belum diset di server. Anda dapat menyalin konfigurasi ENV di bawah ini secara manual.',
        envSnippet,
        canAutoDeploy: false,
      });
    }

    const teamQuery = teamId ? `?teamId=${teamId}` : '';
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const updateResults: any[] = [];

    // 1. Update Environment Variables if token & projectId are available
    if (token && projectId && Array.isArray(envs) && envs.length > 0) {
      // Fetch existing env variables to know whether to POST or PATCH
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

      // Upsert each environment variable
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
    }

    // 2. Trigger Redeploy
    let deployed = false;
    let deployId: string | null = null;
    let deployError: string | null = null;

    if (triggerDeploy) {
      // Approach A: Deploy Hook (if available, highest priority and simplest)
      if (deployHookUrl) {
        try {
          const hookRes = await fetch(deployHookUrl, { method: 'POST' });
          if (hookRes.ok) {
            deployed = true;
            deployId = 'deploy-hook-triggered';
          } else {
            deployError = `Deploy hook returned HTTP ${hookRes.status}`;
          }
        } catch (hookErr: any) {
          deployError = hookErr?.message || 'Gagal memanggil Deploy Hook';
        }
      } 
      // Approach B: Official Vercel REST API Redeployment
      else if (token && projectId) {
        try {
          // Step 1: Get the latest deployment ID of the project
          const listRes = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1${teamQuery ? `&teamId=${teamId}` : ''}`,
            { method: 'GET', headers }
          );

          const listData = await listRes.json().catch(() => ({}));
          const latestDeployment = listData?.deployments?.[0];
          const latestDeploymentId = latestDeployment?.uid || latestDeployment?.id;

          if (latestDeploymentId) {
            const projectName = latestDeployment?.name || projectId;
            
            // Step 2: Trigger redeployment with required name and deploymentId
            let deployRes = await fetch(`https://api.vercel.com/v13/deployments${teamQuery}`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                name: projectName,
                deploymentId: latestDeploymentId,
                target: 'production',
              }),
            });

            let deployData = await deployRes.json().catch(() => ({}));

            // Fallback: try dedicated rebuild endpoint if needed
            if (!deployRes.ok) {
              const rebuildRes = await fetch(
                `https://api.vercel.com/v13/deployments/${latestDeploymentId}/rebuild${teamQuery}`,
                { method: 'POST', headers }
              );
              if (rebuildRes.ok) {
                deployRes = rebuildRes;
                deployData = await rebuildRes.json().catch(() => ({}));
              }
            }

            if (deployRes.ok && (deployData?.id || deployData?.uid)) {
              deployed = true;
              deployId = deployData.id || deployData.uid;
            } else {
              deployError = deployData?.error?.message || `Vercel API error HTTP ${deployRes.status}`;
              console.warn('Vercel deployment failed:', deployData);
            }
          } else {
            deployError = 'Tidak ditemukan deployment sebelumnya di Vercel untuk di-redeploy.';
          }
        } catch (err: any) {
          deployError = err?.message || 'Gagal memicu redeploy via API';
          console.warn('Vercel deploy exception:', err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: deployed
        ? 'Environment variables berhasil diperbarui dan build ulang (redeploy) sedang berjalan di Vercel!'
        : updateResults.length > 0
        ? 'Environment variables berhasil diperbarui di Vercel.'
        : 'Selesai.',
      envSnippet,
      updateResults,
      deployed,
      deployId,
      deployError,
    });
  } catch (error: any) {
    console.error('Update Vercel ENV error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
