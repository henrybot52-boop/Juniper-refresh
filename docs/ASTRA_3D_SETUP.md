# Making 3D models with GPT-6 Astra (the stuff you see on X)

Almost every Astra 3D demo on X uses the same recipe: the model does not "generate a mesh"
directly. It writes and runs **Blender Python** through an **MCP server** that is connected
to a running copy of Blender, iterates until the scene looks right, then exports GLB/FBX,
renders a turntable video with ffmpeg, or hands the scene to Unreal Engine 5 / three.js
for a walkable web version.

The pieces:

| Piece | Why |
|---|---|
| Blender 4.x | The actual modeling engine. Free. |
| `uv` | Runs the `blender-mcp` server with `uvx`. |
| MCP for Blender add-on | Lets the model create objects, edit materials, render, export. |
| Codex CLI (or ChatGPT desktop / Claude Desktop / Cursor) | The client that talks to Astra and to the MCP server. |
| ffmpeg | Encodes rendered frames into the videos people post. |
| Node.js | For three.js / WebGPU browser walkthroughs. |
| A paid ChatGPT plan or API key with Astra access | Astra is rolling out to Plus/Pro/Business/Enterprise and the API. |

## macOS / Linux

```bash
bash scripts/astra-3d-setup.sh
```

## Windows (PowerShell, run as your normal user)

```powershell
winget install BlenderFoundation.Blender
winget install Gyan.FFmpeg
winget install OpenJS.NodeJS.LTS
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
npm install -g @openai/codex
uvx blender-mcp install-addon
codex mcp add blender -- uvx blender-mcp
git clone --depth 1 https://github.com/grapeot/gpt_3d_skill $HOME\astra-3d\gpt_3d_skill
```

If a client reports `spawn uvx ENOENT`, replace `"uvx"` in the config with the full path
from `which uvx` (macOS/Linux) or `where uvx` (Windows).

## Connecting the client

**Codex CLI** is done by the script (`codex mcp add blender -- uvx blender-mcp`). It lands in
`~/.codex/config.toml` as:

```toml
[mcp_servers.blender]
command = "uvx"
args = ["blender-mcp"]
```

**ChatGPT desktop / Claude Desktop / Cursor** use the same JSON in their MCP settings:

```json
{ "mcpServers": { "blender": { "command": "uvx", "args": ["blender-mcp"] } } }
```

## Every session

1. Open Blender, press `N` in the 3D viewport, open the **MCP for Blender** tab, click **Connect**.
2. Start your client: `codex -m gpt-6-astra` (or pick Astra in the ChatGPT app).
3. Prompt in plain language. Good prompts name the subject, style, scale, lighting, and the
   export you want. Example:

   > Research the dimensions of a CAT 320 excavator, then build a stylised low-poly version in
   > Blender through the MCP server. Use a three-point light rig, a neutral studio backdrop,
   > render a 360° turntable at 1080p, and export the model as `excavator.glb`.

4. Ask for a turntable render and let it run ffmpeg to produce the MP4 you post.

## Beyond a single model

- **Walkable scenes**: ask for a GLB export, then "make a three.js first-person walkthrough
  of this scene" (the `gpt_3d_skill` repo has a mobile-friendly template under
  `templates/mobile_walkthrough`).
- **Unreal Engine 5**: export FBX from Blender, import into UE5, and let Astra write the
  Blueprint/level setup. Install UE5 separately through the Epic Games Launcher.
- **Rigging / mocap / AI video**: the `gpt_3d_skill` skills cover rigging, retargeting, and
  hybrid Blender-plus-generative-video pipelines. Point your agent at
  `skills/skill_gpt_3d.md` in that repo.

## Cost note

The excavator demo that went viral cost its author roughly 50 US dollars of API tokens over
two hours. Using a ChatGPT subscription through Codex instead of raw API keys is usually cheaper.
