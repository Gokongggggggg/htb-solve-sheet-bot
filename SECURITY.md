# Security

## Token Handling

HTB Solve Sheet Bot needs an HTB App Token to read profile activity.

Do:

- create a token from `Profile -> Settings -> App Tokens`
- store it only through `HTB Bot -> Set HTB token`
- revoke and rotate the token if it is exposed

Do not:

- commit your token
- paste your HTB password into the script
- store the token in a sheet cell
- share screenshots containing the token

## Reporting Issues

If you find a security issue in this project, avoid posting secrets or live tokens in public issues.
