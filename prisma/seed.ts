async function main() {
  console.log("Database is ready. Sign up in the app and name your first project.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});