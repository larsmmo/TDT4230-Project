#version 430 core

struct PointLight {    
    vec3 position;
    vec3 color;
};

/*
#define MAX_LIGHTS 3

uniform PointLight pointLights[MAX_LIGHTS];

uniform layout(location = 6) int numLights;

*/

uniform layout(location = 0) vec2 imageResolution;

uniform layout(location = 1) float time;

uniform layout(location = 2) vec3 cameraPosition;

uniform layout(location = 3) mat4 viewMatrix;

out vec4 color;

float FOV = 1.0;

//Soft max function (continuous)
float sMax(float a, float b, float k)
{
    float h = max(k - abs(a - b), 0.0);
    return max(a, b) + h*h * 0.25 / k;
}
/*============================================================*/
// Signed distance functions (SDF)

float sphereSDF(vec3 p, float radius)
{
    return length(p) - radius;
}

float boxSDF(vec3 p, vec3 size ) {
     vec3 d = abs(p) - size;
     return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}
/*============================================================*/

float mapWorld(in vec3 point)
{
    float sphere0 = boxSDF(point,  vec3(2.0));

    return sphere0;
}

/* Computes the normal by calculating the gradient of the distance field at given point */
vec3 calculateNormal(in vec3 point)
{
    const vec3 perturbation = vec3(0.001, 0.0, 0.0);

    float gradX = mapWorld(point + perturbation.xyy) - mapWorld(point - perturbation.xyy);
    float gradY = mapWorld(point + perturbation.yxy) - mapWorld(point - perturbation.yxy);
    float gradZ = mapWorld(point + perturbation.yyx) - mapWorld(point - perturbation.yyx);

    vec3 normal = vec3(gradX, gradY, gradZ);

    return normalize(normal);
}

/*============================================================*/

vec3 rayMarch(in vec3 origin, in vec3 dir)
{
	const int N_STEPS = 42;
	const float MIN_HIT_DIST = 0.001;
	const float MAX_RAY_DIST = 1000.0;
	float distTraveled = 0.0;

	for (int i = 0; i < N_STEPS; i++)
	{
		// Current position along ray from the origin
        vec3 currentPos = origin + distTraveled * dir;

        // Find distance from current position to closest point on a sphere with radius = 1 from the origin
        float toClosestDist = mapWorld(currentPos);

        if (toClosestDist < MIN_HIT_DIST)	// Ray hit something
        {
			vec3 normal = calculateNormal(currentPos);

			vec3 lightPos = vec3(-2.0, -3.0, 1.0);
			vec3 lightDir = normalize(currentPos - lightPos);

			float diff = max(0.0, dot(normal, lightDir));

            return vec3(1.0, 0.0, 0.0) * diff ;
        }

        if (toClosestDist > MAX_RAY_DIST)	// Ray did not hit anything
        {
            break;
        }

		// Add to total distance traveled along ray
        distTraveled += toClosestDist;
	}

	//Nothing was hit. Returning background color
    return vec3(0.0);

}

void main()
{
	// Generating a ray from the camera (origin) through every pixel

	// Move center to (0,0)
	vec2 fragPos = (gl_FragCoord.xy/ imageResolution.xy) * 2.0 - 1.0;
	// Correct for image aspect ratio
	fragPos.x *= imageResolution.x / imageResolution.y;

	mat4 rot = mat4(cos(time),		0,		sin(time),		0,
			 				 0,		1.0,			 0,		0,
					-sin(time),	0,		cos(time),		0,
							 0, 	0,				 0,		1);

	vec3 rayDir = vec3(viewMatrix * vec4(vec3(fragPos, FOV), 1.0));

	color = vec4(rayMarch(cameraPosition, rayDir), 1.0);
}