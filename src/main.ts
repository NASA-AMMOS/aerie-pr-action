import * as core from "@actions/core";
import * as github from "@actions/github";
import fs from "fs";

async function run(): Promise<void> {
    try {
        core.info("Starting PR action...");

        // only run when triggered by PR
        const pull_request = github.context.payload.pull_request;
        if (pull_request === undefined) {
            throw new Error("Error, not triggered from PR, aborting...");
        }

        // parse inputs
        const n: number = +core.getInput("numReviewers", { required: true });
        const token: string = core.getInput("token", { required: true });

        // create auth'd github api client
        const gh = github.getOctokit(token);

        // gather context about PR
        const context = github.context;

        const owner = context.repo.owner;
        const repo = context.repo.repo;
        const pull_number = pull_request.number;

        const pr = await gh.rest.pulls.get({
            owner,
            repo,
            pull_number
        });

        const user = pr.data.user;
        if (!user) {
            throw new Error("Error reading user info");
        }

        // assign user who opened PR as default assignee
        const assignees = [user.login];

        const resp = await gh.rest.issues.addAssignees({
            owner,
            repo,
            issue_number: pull_number,
            assignees
        });

        const status = resp.status;

        core.info(
            `resp: ${status}, assigned ${assignees} to PR ${pull_number} in ${repo}`
        );

        // assign n reviewers randomly from CODEOWNERS
        core.info("Detecting CODEOWNERS...");
        const codeowner_raw = fs.readFileSync("./.github/CODEOWNERS", "utf8");
        const codeowners = codeowner_raw
            .trim()
            .split(" @")
            .filter(v => v !== user.login) // don't allow PR opener to be reviewer
            .slice(1); // slice [1..] so we skip any regex at the beginning
        if (codeowners.length < n) {
            throw new Error(
                "Error, supplied n is greater than length of codeowners, can't assign reviewers"
            );
        }
        core.info("Found: ");
        for (const c of codeowners) {
            core.info(c);
        }

        // shuffle list and take first n elemenets
        const to_review = codeowners
            .sort(() => 0.5 - Math.random()) // ¯\_(ツ)_/¯
            .slice(0, n);
        core.info("Assigning the following as reviwers...");
        for (const c of to_review) {
            core.info(c);
        }

        gh.rest.pulls.requestReviewers({
            owner,
            repo,
            pull_number,
            reviewers: to_review
        });
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
