pipeline {
    agent any
    triggers { githubPush() }
    options { timeout(time: 10, unit: 'MINUTES') }

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }
        stage('Build in Docker') {
            steps {
                script {
                    docker.image('node:20-alpine').inside('-e HOME=/tmp') {
                        sh 'node --version'
                        sh 'npm install --omit=dev'
                    }
                }
            }
        }
        stage('Deploy') {
            steps {
                sh 'docker compose -p unici -f docker-compose.jenkins.yml up -d --force-recreate'
            }
        }
        stage('Verify') {
            steps {
                sh '''
                    for i in $(seq 1 30); do
                      if curl -sf http://localhost:8082/api/health; then echo; echo "App is UP"; exit 0; fi
                      sleep 4
                    done
                    echo "App did not become healthy"; docker ps -a --filter name=ci-; exit 1
                '''
            }
        }
    }

    post {
        always {
            script {
                def authorEmail = 'zobiaakbarali@gmail.com'   // fallback
                def authorName  = 'developer'
                try {
                    authorEmail = sh(script: 'git log -1 --pretty=format:%ae', returnStdout: true).trim()
                    authorName  = sh(script: 'git log -1 --pretty=format:%an', returnStdout: true).trim()
                } catch (e) { echo 'Could not read commit author, using fallback' }

                emailext(
                    to: authorEmail,
                    subject: "Jenkins build #${env.BUILD_NUMBER} - ${currentBuild.currentResult} (${env.JOB_NAME})",
                    body: "Hello ${authorName},\n\nYour push triggered a Jenkins build.\n\nResult : ${currentBuild.currentResult}\nJob    : ${env.JOB_NAME}\nBuild  : #${env.BUILD_NUMBER}\nDetails: ${env.BUILD_URL}\n\nThe console log is attached.",
                    attachLog: true
                )
            }
        }
    }
}
