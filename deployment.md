# Deployment Notes

## Deployed Commit

- Deployed Git commit hash: `5e8d17c33e995478fa24a1f61579e15621dcd644`
- This was the commit pushed to `origin/main` for the manual LXC deployment.

## Verification Summary

- API worked locally on the LXC while the manual server process was running.
- The laptop CLI reached the LXC through Tailscale after `HABITAT_API_BASE_URL` was pointed at the server and the backend was listening on port `8787`.
- After the manual server was stopped, the CLI failed with:

```text
Unable to reach Habitat API at http://localhost:8787/status: Unable to connect. Is the computer able to access the url?
```

## OpenClaw Request Logs

When the laptop ran `habitat status`, the OpenClaw server emitted the Habitat API request log in the app's standard format:

```text
[habitat-api] GET /status -> ...
```

The important point is that the remote CLI request reached the server and was handled by the `/status` route.

## Why `0.0.0.0` Is Required

Binding the server to `0.0.0.0` makes it listen on all network interfaces, not just the loopback interface. If the API only binds to `localhost` or `127.0.0.1`, requests coming from another machine over Tailscale cannot reach it, even if the server process is running and the port is correct.

## Why `.env` And `habitat.sqlite` Stay In The Checkout

`.env` and `habitat.sqlite` are needed by the deployed app at runtime, so they remain in the working directory on the server. They are ignored by Git so local configuration, credentials, and Habitat state do not appear in commits, diffs, or class submissions.
