#include <chrono>
#include <GLFW/glfw3.h>
#include <glad/glad.h>
#include <SFML/Audio/SoundBuffer.hpp>
#include <utilities/shader.hpp>
#include <glm/vec3.hpp>
#include <iostream>
#include <utilities/timeutils.h>
#include <utilities/mesh.h>
#include <utilities/shapes.h>
#include <utilities/glutils.h>
#include <SFML/Audio/Sound.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <fmt/format.h>
#include "gamelogic.h"
#include "sceneGraph.hpp"
#define GLM_ENABLE_EXPERIMENTAL
#include <glm/gtx/transform.hpp>

enum KeyFrameAction {
    BOTTOM, TOP
};

#include <timestamps.h>

double padPositionX = 0;
double padPositionZ = 0;

unsigned int currentKeyFrame = 0;
unsigned int previousKeyFrame = 0;

SceneNode* rootNode;
SceneNode* boxNode;
SceneNode* ballNode;
SceneNode* padNode;

double ballRadius = 3.0f;

// These are heap allocated, because they should not be initialised at the start of the program
sf::SoundBuffer* buffer;
Gloom::Shader* shader;
Gloom::Shader* depthShader;
sf::Sound* sound;

const glm::vec3 boxDimensions(180, 90, 90);
const glm::vec3 padDimensions(30, 3, 40);

glm::vec3 ballPosition(0, ballRadius + padDimensions.y, boxDimensions.z / 2);
glm::vec3 ballDirection(1, 1, 0.2f);

CommandLineOptions options;

bool hasStarted = false;
bool hasLost = false;
bool jumpedToNextFrame = false;
bool isPaused = false;

bool mouseLeftPressed   = false;
bool mouseLeftReleased  = false;
bool mouseRightPressed  = false;
bool mouseRightReleased = false;

// Modify if you want the music to start further on in the track. Measured in seconds.
const float debug_startTime = 0;
double totalElapsedTime = debug_startTime;
double gameElapsedTime = debug_startTime;

double mouseSensitivity = 1.0;
double lastMouseX = windowWidth / 2;
double lastMouseY = windowHeight / 2;

void mouseCallback(GLFWwindow* window, double x, double y) {
    int windowWidth, windowHeight;
    glfwGetWindowSize(window, &windowWidth, &windowHeight);
    glViewport(0, 0, windowWidth, windowHeight);

    double deltaX = x - lastMouseX;
    double deltaY = y - lastMouseY;

    padPositionX -= mouseSensitivity * deltaX / windowWidth;
    padPositionZ -= mouseSensitivity * deltaY / windowHeight;

    if (padPositionX > 1) padPositionX = 1;
    if (padPositionX < 0) padPositionX = 0;
    if (padPositionZ > 1) padPositionZ = 1;
    if (padPositionZ < 0) padPositionZ = 0;

    glfwSetCursorPos(window, windowWidth / 2, windowHeight / 2);
}

unsigned int const  numLights = 3;
LightSource lightSources[numLights];

// Variables for shadow mapping. One depthmap for each light.
unsigned int depthMapFrameBuffer;
unsigned int depthCubemap[numLights];

void initGame(GLFWwindow* window, CommandLineOptions gameOptions) {
    buffer = new sf::SoundBuffer();
    if (!buffer->loadFromFile("../res/Hall of the Mountain King.ogg")) {
        return;
    }
    options = gameOptions;

    glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_HIDDEN);
    glfwSetCursorPosCallback(window, mouseCallback);

    shader = new Gloom::Shader();
    shader->makeBasicShader("../res/shaders/simple.vert", "../res/shaders/simple.frag", "../res/shaders/simple.geom");
    shader->activate();

	// Create another shader for shadow mapping
	depthShader = new Gloom::Shader();
	depthShader->makeBasicShader("../res/shaders/depth.vert", "../res/shaders/depth.frag", "../res/shaders/depth.geom");

    // Create meshes
    Mesh pad = cube(padDimensions, glm::vec2(30, 40), true);
    Mesh box = cube(boxDimensions, glm::vec2(90), true, true);
    Mesh sphere = generateSphere(1.0, 40, 40);

    // Fill buffers
    unsigned int ballVAO = generateBuffer(sphere);
    unsigned int boxVAO  = generateBuffer(box);
    unsigned int padVAO  = generateBuffer(pad);

    // Construct scene
    rootNode = createSceneNode();
    boxNode  = createSceneNode();
    padNode  = createSceneNode();
    ballNode = createSceneNode();
	
	for (int light = 0; light < numLights; light++) {
		lightSources[light].lightNode = createSceneNode();
		lightSources[light].lightNode->vertexArrayObjectID = light;
		lightSources[light].lightNode->nodeType = POINT_LIGHT;
		lightSources[light].color[light] = 1.0;
	}

    rootNode->children.push_back(boxNode);
    rootNode->children.push_back(padNode);
    rootNode->children.push_back(ballNode);
	
	boxNode->children.push_back(lightSources[0].lightNode);
	boxNode->children.push_back(lightSources[1].lightNode);
	padNode->children.push_back(lightSources[2].lightNode);

	lightSources[0].lightNode->position = glm::vec3(10.0, -20.0, -15.0);
	lightSources[1].lightNode->position = glm::vec3(-10.0, -20.0, -15.0);
	lightSources[2].lightNode->position = glm::vec3(0.0, 20.0, 5.0);
	
    boxNode->vertexArrayObjectID = boxVAO;
    boxNode->VAOIndexCount = box.indices.size();

    padNode->vertexArrayObjectID = padVAO;
    padNode->VAOIndexCount = pad.indices.size();

    ballNode->vertexArrayObjectID = ballVAO;
    ballNode->VAOIndexCount = sphere.indices.size();

	// Send number of lights to shader
	glUniform1i(6, numLights);

	// Set up cubemap and frame buffer for shadow mapping
	glGenFramebuffers(1, &depthMapFrameBuffer);

	// Each of the 6 faces is a 2D depth-value texture
	for (int light = 0; light < numLights; light++) {
		glGenTextures(1, &depthCubemap[light]);
		glBindTexture(GL_TEXTURE_CUBE_MAP, depthCubemap[light]);
		for (unsigned int i = 0; i < 6; ++i) {
			glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, GL_DEPTH_COMPONENT, 1024, 1024, 0, GL_DEPTH_COMPONENT, GL_FLOAT, NULL);		// create textures
		}
		// Set texture parameters
		glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
		glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
		glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
		glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
		glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);

		// Attach cubemap as the depth attachment of the framebuffer
		glBindFramebuffer(GL_FRAMEBUFFER, depthMapFrameBuffer);
		glFramebufferTexture(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, depthCubemap[light], 0);

		// Tell OpenGL not to not render to color buffer (only need depth values)
		glDrawBuffer(GL_NONE);
		glReadBuffer(GL_NONE);

		// Tell OpenGL which texture unit each sampler belongs to (I should learn how to put everything into one texture. For next time maybe..)
		GLint location_sampler = shader->getUniformFromName(fmt::format("depthMap[{}]", light));
		glUniform1i(location_sampler, light);
	}
	glBindFramebuffer(GL_FRAMEBUFFER, 0);

    getTimeDeltaSeconds();

    std::cout << fmt::format("Initialized scene with {} SceneNodes.", totalChildren(rootNode)) << std::endl;

    std::cout << "Ready. Click to start!" << std::endl;
}

std::vector<glm::mat4> lightSpaceTransform(glm::mat4 projection, LightSource light) {
	// Calculate the 6 different light space matrices for each face of the cubemap used in shadow mapping (look in all 6 directions)
	std::vector<glm::mat4> shadowTransforms;
	shadowTransforms.push_back(projection * glm::lookAt(light.worldPos, light.worldPos + glm::vec3(1.0, 0.0, 0.0), glm::vec3(0.0, -1.0, 0.0)));
	shadowTransforms.push_back(projection * glm::lookAt(light.worldPos, light.worldPos + glm::vec3(-1.0, 0.0, 0.0), glm::vec3(0.0, -1.0, 0.0)));
	shadowTransforms.push_back(projection * glm::lookAt(light.worldPos, light.worldPos + glm::vec3(0.0, 1.0, 0.0), glm::vec3(0.0, 0.0, 1.0)));
	shadowTransforms.push_back(projection * glm::lookAt(light.worldPos, light.worldPos + glm::vec3(0.0, -1.0, 0.0), glm::vec3(0.0, 0.0, -1.0)));
	shadowTransforms.push_back(projection * glm::lookAt(light.worldPos, light.worldPos + glm::vec3(0.0, 0.0, 1.0), glm::vec3(0.0, -1.0, 0.0)));
	shadowTransforms.push_back(projection * glm::lookAt(light.worldPos, light.worldPos + glm::vec3(0.0, 0.0, -1.0), glm::vec3(0.0, -1.0, 0.0)));

	return shadowTransforms;
}

void renderNode(SceneNode* node) {
	glUniformMatrix4fv(3, 1, GL_FALSE, glm::value_ptr(node->MVPMatrix));
	glUniformMatrix4fv(4, 1, GL_FALSE, glm::value_ptr(node->currentTransformationMatrix));
	glm::mat3 normalMatrix = glm::mat3(transpose(inverse(node->currentTransformationMatrix)));
	glUniformMatrix3fv(5, 1, GL_FALSE, glm::value_ptr(normalMatrix));

	switch (node->nodeType) {
	case GEOMETRY:
		if (node->vertexArrayObjectID != -1) {
			glBindVertexArray(node->vertexArrayObjectID);
			glDrawElements(GL_TRIANGLES, node->VAOIndexCount, GL_UNSIGNED_INT, nullptr);
		}
		break;
	case POINT_LIGHT:
	{
		GLint location_position = shader->getUniformFromName(fmt::format("pointLights[{}].position", node->vertexArrayObjectID));		// Vertex array obj ID = light ID
		glUniform3fv(location_position, 1, glm::value_ptr(lightSources[node->vertexArrayObjectID].worldPos));

		GLint location_color = shader->getUniformFromName(fmt::format("pointLights[{}].color", node->vertexArrayObjectID));
		glUniform3fv(location_color, 1, glm::value_ptr(lightSources[node->vertexArrayObjectID].color));
	}
	break;
	case SPOT_LIGHT: break;
	}

	for (SceneNode* child : node->children) {
		renderNode(child);
	}
}

void updateFrame(GLFWwindow* window) {
    glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);

    double timeDelta = getTimeDeltaSeconds();

    const float ballBottomY = boxNode->position.y - (boxDimensions.y/2) + ballRadius + padDimensions.y;
    const float ballTopY    = boxNode->position.y + (boxDimensions.y/2) - ballRadius;
    const float BallVerticalTravelDistance = ballTopY - ballBottomY;

    const float cameraWallOffset = 30; // Arbitrary addition to prevent ball from going too much into camera

    const float ballMinX = boxNode->position.x - (boxDimensions.x/2) + ballRadius;
    const float ballMaxX = boxNode->position.x + (boxDimensions.x/2) - ballRadius;
    const float ballMinZ = boxNode->position.z - (boxDimensions.z/2) + ballRadius;
    const float ballMaxZ = boxNode->position.z + (boxDimensions.z/2) - ballRadius - cameraWallOffset;

    if (glfwGetMouseButton(window, GLFW_MOUSE_BUTTON_1)) {
        mouseLeftPressed = true;
        mouseLeftReleased = false;
    } else {
        mouseLeftReleased = mouseLeftPressed;
        mouseLeftPressed = false;
    }
    if (glfwGetMouseButton(window, GLFW_MOUSE_BUTTON_2)) {
        mouseRightPressed = true;
        mouseRightReleased = false;
    } else {
        mouseRightReleased = mouseRightPressed;
        mouseRightPressed = false;
    }
    
    if(!hasStarted) {
        if (mouseLeftPressed) {
            if (options.enableMusic) {
                sound = new sf::Sound();
                sound->setBuffer(*buffer);
                sf::Time startTime = sf::seconds(debug_startTime);
                sound->setPlayingOffset(startTime);
                sound->play();
            }
            totalElapsedTime = debug_startTime;
            gameElapsedTime = debug_startTime;
            hasStarted = true;
        }

        ballPosition.x = ballMinX + (1 - padPositionX) * (ballMaxX - ballMinX);
        ballPosition.y = ballBottomY + 15;
        ballPosition.z = ballMinZ + (1 - padPositionZ) * ((ballMaxZ+cameraWallOffset) - ballMinZ);
    } else {
        totalElapsedTime += timeDelta;
        if(hasLost) {
            if (mouseLeftReleased) {
                hasLost = false;
                hasStarted = false;
                currentKeyFrame = 0;
                previousKeyFrame = 0;
            }
        } else if (isPaused) {
            if (mouseRightReleased) {
                isPaused = false;
                if (options.enableMusic) {
                    sound->play();
                }
            }
        } else {
            gameElapsedTime += timeDelta;
            if (mouseRightReleased) {
                isPaused = true;
                if (options.enableMusic) {
                    sound->pause();
                }
            }
            // Get the timing for the beat of the song
            for (unsigned int i = currentKeyFrame; i < keyFrameTimeStamps.size(); i++) {
                if (gameElapsedTime < keyFrameTimeStamps.at(i)) {
                    continue;
                }
                currentKeyFrame = i;
            }

            jumpedToNextFrame = currentKeyFrame != previousKeyFrame;
            previousKeyFrame = currentKeyFrame;

            double frameStart = keyFrameTimeStamps.at(currentKeyFrame);
            double frameEnd = keyFrameTimeStamps.at(currentKeyFrame + 1); // Assumes last keyframe at infinity

            double elapsedTimeInFrame = gameElapsedTime - frameStart;
            double frameDuration = frameEnd - frameStart;
            double fractionFrameComplete = elapsedTimeInFrame / frameDuration;

            double ballYCoord;

            KeyFrameAction currentOrigin = keyFrameDirections.at(currentKeyFrame);
            KeyFrameAction currentDestination = keyFrameDirections.at(currentKeyFrame + 1);

            // Synchronize ball with music
            if (currentOrigin == BOTTOM && currentDestination == BOTTOM) {
                ballYCoord = ballBottomY;
            } else if (currentOrigin == TOP && currentDestination == TOP) {
                ballYCoord = ballBottomY + BallVerticalTravelDistance;
            } else if (currentDestination == BOTTOM) {
                ballYCoord = ballBottomY + BallVerticalTravelDistance * (1 - fractionFrameComplete);
            } else if (currentDestination == TOP) {
                ballYCoord = ballBottomY + BallVerticalTravelDistance * fractionFrameComplete;
            }

            // Make ball move
            const float ballSpeed = 60.0f;
            ballPosition.x += timeDelta * ballSpeed * ballDirection.x;
            ballPosition.y = ballYCoord;
            ballPosition.z += timeDelta * ballSpeed * ballDirection.z;

            // Make ball bounce
            if (ballPosition.x < ballMinX) {
                ballPosition.x = ballMinX;
                ballDirection.x *= -1;
            } else if (ballPosition.x > ballMaxX) {
                ballPosition.x = ballMaxX;
                ballDirection.x *= -1;
            }
            if (ballPosition.z < ballMinZ) {
                ballPosition.z = ballMinZ;
                ballDirection.z *= -1;
            } else if (ballPosition.z > ballMaxZ) {
                ballPosition.z = ballMaxZ;
                ballDirection.z *= -1;
            }

            if(options.enableAutoplay) {
                padPositionX = 1-(ballPosition.x - ballMinX) / (ballMaxX - ballMinX);
                padPositionZ = 1-(ballPosition.z - ballMinZ) / ((ballMaxZ+cameraWallOffset) - ballMinZ);
            }

            // Check if the ball is hitting the pad when the ball is at the bottom.
            // If not, you just lost the game! (hehe)
            if (jumpedToNextFrame && currentOrigin == BOTTOM && currentDestination == TOP) {
                double padLeftX  = boxNode->position.x - (boxDimensions.x/2) + (1 - padPositionX) * (boxDimensions.x - padDimensions.x);
                double padRightX = padLeftX + padDimensions.x;
                double padFrontZ = boxNode->position.z - (boxDimensions.z/2) + (1 - padPositionZ) * (boxDimensions.z - padDimensions.z);
                double padBackZ  = padFrontZ + padDimensions.z;

                if (   ballPosition.x < padLeftX
                    || ballPosition.x > padRightX
                    || ballPosition.z < padFrontZ
                    || ballPosition.z > padBackZ) {
                    hasLost = true;
                    if (options.enableMusic) {
                        sound->stop();
                        delete sound;
                    }
                }
            }
        }
    }

    glm::mat4 projection = glm::perspective(glm::radians(80.0f), float(windowWidth) / float(windowHeight), 0.1f, 350.f);

    glm::vec3 cameraPosition = glm::vec3(0, 2, -20);

	glUniform3fv(10, 1, glm::value_ptr(cameraPosition));

    // Some math to make the camera move in a nice way
    float lookRotation = -0.6 / (1 + exp(-5 * (padPositionX-0.5))) + 0.3;
    glm::mat4 cameraTransform = 
                    glm::rotate(0.3f + 0.2f * float(-padPositionZ*padPositionZ), glm::vec3(1, 0, 0)) *
                    glm::rotate(lookRotation, glm::vec3(0, 1, 0)) *
                    glm::translate(-cameraPosition);

    glm::mat4 VP = projection * cameraTransform;

    // Move and rotate various SceneNodes
    boxNode->position = { 0, -10, -80 };

    ballNode->position = ballPosition;
    ballNode->scale = glm::vec3(ballRadius);
    ballNode->rotation = { 0, totalElapsedTime*2, 0 };

    padNode->position  = { 
        boxNode->position.x - (boxDimensions.x/2) + (padDimensions.x/2) + (1 - padPositionX) * (boxDimensions.x - padDimensions.x), 
        boxNode->position.y - (boxDimensions.y/2) + (padDimensions.y/2), 
        boxNode->position.z - (boxDimensions.z/2) + (padDimensions.z/2) + (1 - padPositionZ) * (boxDimensions.z - padDimensions.z)
    };

	// Adding shadows
	// Render the scene from the light's perspective using shadow mapping with front-face culling to reduce peter-panning effect
	glCullFace(GL_FRONT);
	glm::mat4 shadowProjection = glm::perspective(glm::radians(90.0f), float(1024.0) / float(1024.0), 0.1f, 350.f);
	glViewport(0, 0, 1024, 1024);
	depthShader->activate();

	for (int light = 0; light < numLights; light++) {
		std::vector<glm::mat4> shadowTransforms = lightSpaceTransform(shadowProjection, lightSources[light]);

		// Render to depth cubemap
		glBindFramebuffer(GL_FRAMEBUFFER, depthMapFrameBuffer);
		glFramebufferTexture(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, depthCubemap[light], 0);
		glClear(GL_DEPTH_BUFFER_BIT);
		for (unsigned int i = 0; i < 6; ++i) {
			GLint location_shadowMat = depthShader->getUniformFromName(fmt::format("shadowMatrices[{}]", i));
			glUniformMatrix4fv(location_shadowMat, 1, false, glm::value_ptr(shadowTransforms[i]));
		}
		GLint location_lightPos = glGetUniformLocation(depthShader->get(), "lightPos");
		glUniform3fv(location_lightPos, 1, glm::value_ptr(lightSources[light].worldPos));

		renderNode(rootNode);

		glBindFramebuffer(GL_FRAMEBUFFER, 0);
		glActiveTexture(GL_TEXTURE0 + light);
		glBindTexture(GL_TEXTURE_CUBE_MAP, depthCubemap[light]);
	}
	// Scene is rendered again normally in the program.cpp loop
	shader->activate();
	glCullFace(GL_BACK);

    updateNodeTransformations(rootNode, glm::mat4(1.0f), VP);

}

void updateNodeTransformations(SceneNode* node, glm::mat4 transformationThusFar, glm::mat4 viewProjection) {
    glm::mat4 transformationMatrix =
              glm::translate(node->position)
            * glm::translate(node->referencePoint)
            * glm::rotate(node->rotation.y, glm::vec3(0,1,0))
            * glm::rotate(node->rotation.x, glm::vec3(1,0,0))
            * glm::rotate(node->rotation.z, glm::vec3(0,0,1))
            * glm::scale(node->scale)
            * glm::translate(-node->referencePoint);

    node->currentTransformationMatrix = transformationThusFar * transformationMatrix;
	node->MVPMatrix = viewProjection * node->currentTransformationMatrix;

    switch(node->nodeType) {
        case GEOMETRY: break;
		case POINT_LIGHT:
			// Calculating the world coordinates of a light source by multiplying the transformation matrix by the origin of the world space
			glm::vec4 origin = glm::vec4(0, 0, 0, 1.0);
			lightSources[node->vertexArrayObjectID].worldPos = glm::vec3(node->currentTransformationMatrix * origin);
			break;
        case SPOT_LIGHT: break;
    }

    for(SceneNode* child : node->children) {
        updateNodeTransformations(child, node->currentTransformationMatrix, viewProjection);
    }
}

void renderFrame(GLFWwindow* window) {
    int windowWidth, windowHeight;
    glfwGetWindowSize(window, &windowWidth, &windowHeight);
    glViewport(0, 0, windowWidth, windowHeight);

    renderNode(rootNode);
}
