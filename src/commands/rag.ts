/**
 * RAG CLI commands for indexing and querying
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { RAGDatabase } from "../rag/db.js";
import { RAGIndexer } from "../rag/indexer.js";
import { RAGRetriever } from "../rag/retriever.js";

export function registerRAGCommands(program: Command) {
  const ragCmd = program.command("rag").description("RAG (Retrieval Augmented Generation) operations");

  // Index command
  ragCmd
    .command("index")
    .description("Index codebase for semantic search")
    .option("-p, --patterns <patterns...>", "File patterns to include", ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx", "**/*.md"])
    .option("-e, --exclude <patterns...>", "File patterns to exclude", ["**/node_modules/**", "**/dist/**", "**/.git/**"])
    .option("-s, --chunk-size <size>", "Chunk size in characters", "1000")
    .option("-o, --overlap <overlap>", "Chunk overlap in characters", "200")
    .option("--max-size <size>", "Maximum file size in bytes", "1048576")
    .option("--no-metadata", "Skip metadata extraction")
    .action(async (opts) => {
      const spinner = ora("Initializing RAG database...").start();
      
      try {
        const db = new RAGDatabase();
        const indexer = new RAGIndexer(db, {
          includePatterns: opts.patterns,
          excludePatterns: opts.exclude,
          chunkSize: parseInt(opts.chunkSize),
          chunkOverlap: parseInt(opts.overlap),
          maxFileSize: parseInt(opts.maxSize),
          extractMetadata: opts.metadata
        });

        spinner.text = "Indexing files...";
        const result = await indexer.indexFiles();

        spinner.succeed(`Indexed ${result.indexedFiles} files with ${result.totalChunks} chunks`);

        if (result.errors.length > 0) {
          console.log(chalk.yellow(`\n⚠️  ${result.errors.length} files had errors:`));
          for (const error of result.errors) {
            console.log(chalk.red(`  ✗ ${error.file}: ${error.error}`));
          }
        }

        // Show stats
        const stats = db.getStats();
        console.log(chalk.blue("\n📊 Index Statistics:"));
        console.log(`  Files: ${stats.totalFiles}`);
        console.log(`  Chunks: ${stats.totalChunks}`);
        console.log(`  Size: ${formatBytes(stats.totalSize)}`);
        console.log(`  Avg chunk size: ${formatBytes(stats.averageChunkSize)}`);

        db.close();
      } catch (error) {
        spinner.fail("Indexing failed");
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Query command
  ragCmd
    .command("query <query>")
    .description("Search the indexed content")
    .option("-k, --top-k <number>", "Number of results to return", "10")
    .option("-s, --min-score <score>", "Minimum relevance score", "0.1")
    .option("-f, --file <pattern>", "Filter by file path pattern")
    .option("--scope <scope>", "Search scope: all|code|docs", "all")
    .option("--group-by-file", "Group results by file")
    .option("--max-chunks-per-file <number>", "Maximum chunks per file when grouping", "3")
    .option("--context", "Include surrounding context")
    .action(async (query, opts) => {
      const spinner = ora("Searching...").start();
      
      try {
        const db = new RAGDatabase();
        const retriever = new RAGRetriever(db, {
          topK: parseInt(opts.topK),
          minScore: parseFloat(opts.minScore),
          groupByFile: opts.groupByFile,
          maxChunksPerFile: parseInt(opts.maxChunksPerFile)
        });

        let results;
        if (opts.context) {
          results = await retriever.getContextChunks(query, {
            topK: parseInt(opts.topK),
            minScore: parseFloat(opts.minScore)
          });
        } else {
          const retrieval = await retriever.retrieve(query, {
            topK: parseInt(opts.topK),
            minScore: parseFloat(opts.minScore)
          });
          results = retrieval.results;
        }

        spinner.succeed(`Found ${results.length} results`);

        if (results.length === 0) {
          console.log(chalk.yellow("No results found. Try a different query or check your index."));
          return;
        }

        // Display results
        console.log(chalk.blue(`\n🔍 Search Results for: "${query}"`));
        console.log(chalk.gray(`Found ${results.length} results\n`));

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const score = 'score' in result ? result.score : result.bm25_score;
          
          console.log(chalk.cyan(`${i + 1}. ${result.filePath}`));
          console.log(chalk.gray(`   Chunk ${result.chunkIndex + 1}/${result.totalChunks} (score: ${score.toFixed(3)})`));
          
          if ('context' in result && result.context) {
            console.log(chalk.gray(`   Context: ${result.context.substring(0, 200)}...`));
          }
          
          console.log(chalk.white(`   ${result.content.substring(0, 300)}${result.content.length > 300 ? '...' : ''}`));
          console.log();
        }

        db.close();
      } catch (error) {
        spinner.fail("Search failed");
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Stats command
  ragCmd
    .command("stats")
    .description("Show RAG database statistics")
    .action(async () => {
      const spinner = ora("Loading statistics...").start();
      
      try {
        const db = new RAGDatabase();
        const stats = db.getStats();

        spinner.succeed("Statistics loaded");

        console.log(chalk.blue("\n📊 RAG Database Statistics"));
        console.log(chalk.gray("=" .repeat(40)));
        console.log(`Database: ${chalk.cyan(db.getDbPath())}`);
        console.log(`Files indexed: ${chalk.green(stats.totalFiles)}`);
        console.log(`Total chunks: ${chalk.green(stats.totalChunks)}`);
        console.log(`Total size: ${chalk.green(formatBytes(stats.totalSize))}`);
        console.log(`Average chunk size: ${chalk.green(formatBytes(stats.averageChunkSize))}`);

        if (stats.totalChunks > 0) {
          console.log(chalk.gray("\nFile distribution:"));
          // Get file distribution
          const fileStats = db.getFileChunks("").reduce((acc, chunk) => {
            acc[chunk.filePath] = (acc[chunk.filePath] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const sortedFiles = Object.entries(fileStats)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

          for (const [file, count] of sortedFiles) {
            console.log(`  ${chalk.cyan(file)}: ${chalk.green(count)} chunks`);
          }
        }

        db.close();
      } catch (error) {
        spinner.fail("Failed to load statistics");
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Clear command
  ragCmd
    .command("clear")
    .description("Clear all indexed data")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (opts) => {
      if (!opts.yes) {
        const prompts = await import("prompts");
        const response = await prompts.default({
          type: "confirm",
          name: "value",
          message: "Are you sure you want to clear all indexed data?",
          initial: false
        });

        if (!response.value) {
          console.log(chalk.yellow("Operation cancelled"));
          return;
        }
      }

      const spinner = ora("Clearing database...").start();
      
      try {
        const db = new RAGDatabase();
        db.clear();
        spinner.succeed("Database cleared");
        db.close();
      } catch (error) {
        spinner.fail("Failed to clear database");
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // Reindex command
  ragCmd
    .command("reindex <file>")
    .description("Reindex a specific file")
    .action(async (file) => {
      const spinner = ora(`Reindexing ${file}...`).start();
      
      try {
        const db = new RAGDatabase();
        const indexer = new RAGIndexer(db);
        
        const chunkCount = await indexer.reindexFile(file);
        spinner.succeed(`Reindexed ${file} (${chunkCount} chunks)`);
        
        db.close();
      } catch (error) {
        spinner.fail(`Failed to reindex ${file}`);
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
