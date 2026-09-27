async function main() {
  console.log("Database is ready. Sign up in the app to create your example projects.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});