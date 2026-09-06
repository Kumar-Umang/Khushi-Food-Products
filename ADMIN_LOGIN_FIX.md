# Admin login fix

The Cloudflare Workers Web Crypto runtime rejects PBKDF2 iteration counts above 100000. This build uses PBKDF2-SHA256 with 100000 iterations.

For the temporary administrator used during setup:
- Username: Khushbu
- Password: Khushbu@2026!
- Salt: 7f1c0b9d6a4e2f81c3d5a7e9b1f4c6d8
- Password hash (100000 iterations): 25d14191065a6855169deafb5f800c75133f1bbfe890a889cd07950daf56578c

If the D1 row already exists with the previous hash, run:

npx.cmd wrangler d1 execute khushi-food-products-db --remote --command="UPDATE users SET password_hash='25d14191065a6855169deafb5f800c75133f1bbfe890a889cd07950daf56578c', salt='7f1c0b9d6a4e2f81c3d5a7e9b1f4c6d8' WHERE username='Khushbu';"

Then deploy the Worker:

npx.cmd wrangler deploy
